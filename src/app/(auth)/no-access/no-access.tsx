"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NoAccess() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No admin access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>Your account is not an admin. Ask a super admin to invite you.</p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
