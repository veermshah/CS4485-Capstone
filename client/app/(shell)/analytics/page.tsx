import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const metrics = [
  { label: "Overall Accuracy", value: "87.6%" },
  { label: "Macro F1", value: "0.79" },
  { label: "Precision", value: "0.82" },
  { label: "Recall", value: "0.77" },
];

const classRows = [
  { className: "No Damage", precision: "0.90", recall: "0.88", f1: "0.89" },
  { className: "Minor", precision: "0.81", recall: "0.75", f1: "0.78" },
  { className: "Major", precision: "0.74", recall: "0.72", f1: "0.73" },
  { className: "Destroyed", precision: "0.85", recall: "0.69", f1: "0.76" },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="pb-2">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl">{metric.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Confusion Matrix</CardTitle>
          <CardDescription>Placeholder matrix with mock values</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>True \ Pred</TableHead>
                <TableHead>No Damage</TableHead>
                <TableHead>Minor</TableHead>
                <TableHead>Major</TableHead>
                <TableHead>Destroyed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>No Damage</TableCell>
                <TableCell>58</TableCell>
                <TableCell>6</TableCell>
                <TableCell>2</TableCell>
                <TableCell>1</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Minor</TableCell>
                <TableCell>5</TableCell>
                <TableCell>44</TableCell>
                <TableCell>9</TableCell>
                <TableCell>2</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Major</TableCell>
                <TableCell>2</TableCell>
                <TableCell>8</TableCell>
                <TableCell>39</TableCell>
                <TableCell>5</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Destroyed</TableCell>
                <TableCell>0</TableCell>
                <TableCell>2</TableCell>
                <TableCell>11</TableCell>
                <TableCell>31</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Class Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Precision</TableHead>
                <TableHead>Recall</TableHead>
                <TableHead>F1</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classRows.map((row) => (
                <TableRow key={row.className}>
                  <TableCell>{row.className}</TableCell>
                  <TableCell>{row.precision}</TableCell>
                  <TableCell>{row.recall}</TableCell>
                  <TableCell>{row.f1}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
