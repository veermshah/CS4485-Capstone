import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3">
        <Link href="/" className="mr-1 text-sm font-semibold tracking-tight">
          WildfireOps
        </Link>

        <Badge variant="secondary" className="h-9 rounded-md px-3 text-sm font-medium">
          Dataset: Wildfires
        </Badge>

        <Select defaultValue="run-1302">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select run" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="run-1302">Run 1302</SelectItem>
            <SelectItem value="run-1303">Run 1303</SelectItem>
          </SelectContent>
        </Select>

        <Button asChild variant="outline" size="icon" className="ml-auto" aria-label="Open jobs">
          <Link href="/jobs">
            <BriefcaseBusiness className="h-4 w-4" />
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              User Menu
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
