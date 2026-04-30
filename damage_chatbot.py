"""
Disaster Damage Assessment Chatbot
====================================
Uses Google Gemini to answer questions about VLM damage assessment output.
Maintains full conversation history per session.

Integration:
    from damage_chatbot import DamageChatbot

    bot = DamageChatbot()  # auto-loads evaluation_results.csv from same folder
    response = bot.chat(message="How accurate were the predictions?", session_id="user_1")
    print(response)
"""

import os
import re
import sys
import pandas as pd
from google import genai
from dotenv import load_dotenv
from typing import Optional

# Load variables from .env file into the environment.
# Has no effect if the variables are already set (e.g. in production via CI/CD secrets).
load_dotenv("api.env")


# Exact CSV columns from the VLM output pipeline
CSV_COLUMNS = ["uid", "true_label", "gemini_label", "correct"]

# CSV is assumed to live in the same folder as this script
CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "evaluation_results.csv")

SYSTEM_PROMPT = """
You are an AI assistant for disaster damage assessment.
You have access to evaluation data produced by a Vision-Language Model (VLM) pipeline
that analyzed pre- and post-disaster aerial imagery.

The dataset has the following columns:
- uid:          Unique identifier for each assessed location or image tile
- true_label:   Ground truth damage label (from FEMA or human annotation)
- gemini_label: Damage label predicted by the Gemini VLM model
- correct:      Whether the Gemini prediction matched the ground truth (True/False)

Damage label categories used: no-damage, minor-damage, major-damage, destroyed
(Labels are hyphenated lowercase strings, e.g. "no-damage" not "No Damage")

Note on un-classified predictions:
Some rows have gemini_label = "un-classified", meaning the model could not produce
a valid label. There are {unclassified_count} such rows in this dataset. These are
excluded from all accuracy calculations — they are not counted as incorrect.

Your job is to help emergency responders, analysts, and recovery teams understand:
- Overall model accuracy and prediction quality
- Breakdown of damage levels across assessed locations
- Where the model agreed or disagreed with ground truth
- Which damage classes were most/least accurately predicted
- Specific uid lookups when asked

Guidelines:
- Be clear and factual. This data may inform emergency decisions.
- When discussing accuracy, always clarify it is calculated over classified predictions only.
- If a uid lookup result is provided below, use it to answer the user's question.
- If no uid lookup is provided and the user asks about a specific uid, say the uid was not found.
- Do not guess or hallucinate uids or labels not present in the data.
- You may provide data from internet (Santa Rosa is the disaster we are talking about), but must provide sources.
Current dataset summary:
{data_summary}

{uid_context}
"""


class DamageChatbot:
    """
    A session-aware chatbot that uses Google Gemini to answer questions
    about VLM disaster damage assessment evaluation output.

    CSV format: uid, true_label, gemini_label, correct

    Each session_id maintains its own conversation history, allowing
    multiple users or UI threads to run concurrently without mixing context.

    """

    def __init__(self, csv_path: str = CSV_PATH):
        """
        Args:
            csv_path: Path to the VLM output CSV. Defaults to evaluation_results.csv
                      in the same directory as this script.
        """
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY not found. "
                "Make sure it is set in your .env file or environment."
            )

        self.client = genai.Client(api_key=api_key)

        self.df: Optional[pd.DataFrame] = None
        self.csv_summary: str = "No dataset loaded yet."
        self.unclassified_count: int = 0

        # session_id -> list of {"role": str, "parts": [str]} dicts
        self.sessions: dict[str, list] = {}

        self.load_csv(csv_path)

    # ─────────────────────────────────────────────
    # CSV Loading
    # ─────────────────────────────────────────────

    def load_csv(self, csv_path: str) -> str:
        """
        Load the VLM output CSV with columns: uid, true_label, gemini_label, correct.

        Args:
            csv_path: Path to the CSV file.

        Returns:
            A human-readable summary string of what was loaded.

        """
        try:
            self.df = pd.read_csv(csv_path)
        except FileNotFoundError:
            raise FileNotFoundError(f"CSV file not found: {csv_path}")
        except Exception as e:
            raise ValueError(f"Failed to read CSV: {e}")

        self._validate_columns()
        self._coerce_types()
        self.csv_summary = self._build_summary()

        return self.csv_summary

    def _validate_columns(self):
        """Check that all required columns are present."""
        missing = [c for c in CSV_COLUMNS if c not in self.df.columns]
        if missing:
            raise ValueError(
                f"CSV is missing required columns: {missing}. "
                f"Expected: {CSV_COLUMNS}. Found: {list(self.df.columns)}"
            )

    def _coerce_types(self):
        """Normalize column types for consistent querying.

        Handles the real data format:
            46fafb6b-1493-4742-98f4-3d61ed1877d8,no-damage,no-damage,True
        - uid is a UUID string; strip whitespace in case of padding
        - labels are hyphenated lowercase (no-damage, minor-damage, major-damage, destroyed)
        - correct is the string "True"/"False" when read from CSV as object dtype
        """
        # UUID strings — strip any accidental whitespace or newlines
        self.df["uid"] = self.df["uid"].astype(str).str.strip()

        # Labels are already hyphenated lowercase; strip just in case of trailing whitespace
        self.df["true_label"] = self.df["true_label"].astype(str).str.strip().str.lower()
        self.df["gemini_label"] = self.df["gemini_label"].astype(str).str.strip().str.lower()

        # 'correct' comes in as the string "True"/"False" from CSV; map to bool
        if self.df["correct"].dtype == object:
            self.df["correct"] = self.df["correct"].astype(str).str.strip().str.lower().map(
                {"true": True, "false": False, "1": True, "0": False,
                 "yes": True, "no": False}
            )
        else:
            self.df["correct"] = self.df["correct"].astype(bool)

        # "un-classified" means the model could not produce a valid label.
        # Cast correct to object dtype first so pandas can hold None alongside booleans,
        # then set unclassified rows to None so they are excluded from accuracy calculations.
        unclassified_mask = self.df["gemini_label"] == "un-classified"
        self.df["correct"] = self.df["correct"].astype(object)
        self.df.loc[unclassified_mask, "correct"] = None
        self.df["unclassified"] = unclassified_mask
        self.unclassified_count = int(unclassified_mask.sum())

    def _build_summary(self) -> str:
        """Build a plain-text summary of the dataset for the system prompt."""
        df = self.df
        total = len(df)
        classified = df[df["gemini_label"] != "un-classified"]
        classified_total = len(classified)
        correct_count = int(classified["correct"].sum())
        accuracy = correct_count / classified_total * 100 if classified_total > 0 else 0

        lines = [
            f"Total assessed locations: {total}",
            f"Un-classified predictions (excluded from accuracy): {self.unclassified_count}",
            f"Classified predictions: {classified_total}",
            f"Overall model accuracy (classified only): {accuracy:.1f}% ({correct_count}/{classified_total} correct)",
            "",
            "Ground truth label distribution:",
        ]

        true_counts = df["true_label"].value_counts()
        for label, count in true_counts.items():
            lines.append(f"  - {label}: {count} ({count / total * 100:.1f}%)")

        lines.append("")
        lines.append("Gemini predicted label distribution:")
        for label, count in df["gemini_label"].value_counts().items():
            lines.append(f"  - {label}: {count} ({count / total * 100:.1f}%)")

        lines.append("")
        lines.append("Per-class accuracy (classified predictions only, based on true_label):")
        for label in true_counts.index:
            subset = classified[classified["true_label"] == label]
            if len(subset) == 0:
                continue
            class_acc = subset["correct"].sum() / len(subset) * 100
            lines.append(
                f"  - {label}: {class_acc:.1f}% ({int(subset['correct'].sum())}/{len(subset)})"
            )

        return "\n".join(lines)

    # ─────────────────────────────────────────────
    # Chat
    # ─────────────────────────────────────────────

    def chat(self, message: str, session_id: str = "default") -> str:
        """
        Send a message and get a response. Maintains history per session.

        Args:
            message:    The user's message.
            session_id: Unique identifier for this conversation session.
                        Use separate IDs per user/thread to keep histories isolated.

        Returns:
            The assistant's response as a plain string.
        """
        if session_id not in self.sessions:
            # Each session stores history and whether the system prompt has been sent.
            # The system prompt (with the dataset summary) is only sent once per session
            # on the first message — after that Gemini remembers it via history.
            self.sessions[session_id] = {"history": [], "initialized": False}

        session = self.sessions[session_id]
        history = session["history"]
        is_first_message = not session["initialized"]

        # Check if the user mentioned a uid (UUID pattern) and look it up locally
        # so we only send the relevant row to Gemini, not the entire CSV.
        uid_context = ""
        uid_matches = re.findall(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            message, re.IGNORECASE
        )
        if uid_matches and self.df is not None:
            results = []
            for uid in uid_matches:
                record = self.lookup_uid(uid)
                if record:
                    results.append(
                        f"  uid: {record['uid']}\n"
                        f"  true_label: {record['true_label']}\n"
                        f"  gemini_label: {record['gemini_label']}\n"
                        f"  correct: {record['correct']}"
                    )
                else:
                    results.append(f"  uid {uid}: not found in dataset")
            uid_context = "Uid lookup results for this query:\n" + "\n\n".join(results)

        # Build the messages list.
        # The system prompt (dataset summary) is only included on the first message.
        # After that, Gemini already knows the context via conversation history.
        # uid lookup results are appended to the user message when relevant.
        user_message = message if not uid_context else f"{message}\n\n{uid_context}"

        if is_first_message:
            system = SYSTEM_PROMPT.format(
                data_summary=self.csv_summary,
                unclassified_count=self.unclassified_count,
                uid_context=uid_context,
            )
            messages = [
                {"role": "user",  "parts": [{"text": system}]},
                {"role": "model", "parts": [{"text": "Understood. I have the dataset summary and I'm ready to answer questions."}]},
                {"role": "user",  "parts": [{"text": user_message}]},
            ]
            session["initialized"] = True
        else:
            messages = [
                *[{"role": h["role"], "parts": [{"text": h["parts"][0]}]} for h in history],
                {"role": "user",  "parts": [{"text": user_message}]},
            ]

        response = self.client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=messages,
        )
        reply = response.text

        history.append({"role": "user",  "parts": [user_message]})
        history.append({"role": "model", "parts": [reply]})

        return reply

    def clear_session(self, session_id: str):
        """Clear conversation history for a given session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
        # Deleting the session means next message will re-send the system prompt once.

    def clear_all_sessions(self):
        """Clear all active session histories."""
        self.sessions.clear()

    def get_history(self, session_id: str) -> list[dict]:
        """
        Return raw conversation history for a session.

        Returns:
            List of {"role": "user"|"model", "parts": [str]} dicts.
        """
        return self.sessions.get(session_id, {"history": []}).get("history", [])

    # ─────────────────────────────────────────────
    # Helper methods for UI / dashboard integration
    # ─────────────────────────────────────────────

    def get_stats(self) -> dict:
        """
        Return evaluation statistics as a dict for dashboard widgets.

        Returns:
            {
                "total": int,
                "unclassified": int,
                "classified_total": int,
                "correct": int,
                "accuracy": float,                          # 0.0 - 100.0
                "true_label_counts": {label: int, ...},
                "gemini_label_counts": {label: int, ...},
                "per_class_accuracy": {label: float, ...}, # 0.0 - 100.0
            }
        """
        if self.df is None:
            return {}

        df = self.df
        total = len(df)
        classified = df[df["gemini_label"] != "un-classified"]
        classified_total = len(classified)
        correct = int(classified["correct"].sum())

        per_class = {}
        for label in classified["true_label"].unique():
            subset = classified[classified["true_label"] == label]
            per_class[label] = round(subset["correct"].sum() / len(subset) * 100, 2)

        return {
            "total": total,
            "unclassified": self.unclassified_count,
            "classified_total": classified_total,
            "correct": correct,
            "accuracy": round(correct / classified_total * 100, 2) if classified_total > 0 else 0.0,
            "true_label_counts": df["true_label"].value_counts().to_dict(),
            "gemini_label_counts": df["gemini_label"].value_counts().to_dict(),
            "per_class_accuracy": per_class,
        }

    def lookup_uid(self, uid: str) -> Optional[dict]:
        """
        Look up a specific record by uid.

        Args:
            uid: The uid string to search for.

        Returns:
            A dict with uid, true_label, gemini_label, correct — or None if not found.
        """
        if self.df is None:
            return None

        row = self.df[self.df["uid"] == str(uid)]
        if row.empty:
            return None

        return row.iloc[0].to_dict()

    def get_mismatches(self) -> list[dict]:
        """
        Return all records where the model prediction was incorrect.
        Un-classified rows are excluded — they are not treated as wrong.

        Returns:
            List of dicts with uid, true_label, gemini_label, correct=False.
        """
        if self.df is None:
            return []

        classified = self.df[self.df["gemini_label"] != "un-classified"]
        return classified[classified["correct"] == False].to_dict(orient="records")


# ─────────────────────────────────────────────
# Standalone CLI test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 55)
    print("  DisasterIQ — Damage Assessment Chatbot")
    print("=" * 55)

    try:
        bot = DamageChatbot()
    except EnvironmentError as e:
        print(f"Error: {e}")
        sys.exit(1)

    print(f"\nLoading dataset from: {CSV_PATH}")
    try:
        summary = bot.load_csv(CSV_PATH)
        print(f"Dataset loaded:\n{summary}\n")
    except Exception as e:
        print(f"Warning: Could not load CSV — {e}\n")

    print("Commands: 'quit' to exit | 'clear' to reset conversation | 'stats' to print stats\n")

    session = "cli_session"

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            sys.exit(0)

        if not user_input:
            continue

        if user_input.lower() == "quit":
            print("Goodbye.")
            break

        if user_input.lower() == "clear":
            bot.clear_session(session)
            print("Conversation cleared.\n")
            continue

        if user_input.lower() == "stats":
            print(bot.get_stats(), "\n")
            continue

        try:
            reply = bot.chat(message=user_input, session_id=session)
            print(f"\nDisasterIQ: {reply}\n")
        except Exception as e:
            print(f"\nError: {e}\n")
