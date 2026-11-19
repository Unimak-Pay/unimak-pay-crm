import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge, statusTone } from "./format";
import { GatedButton } from "./permission";
import { TooltipProvider } from "./ui/tooltip";

const can = vi.fn<(p: string | null | undefined) => boolean>();
vi.mock("@/auth/auth-provider", () => ({ useAuth: () => ({ can }) }));

describe("GatedButton", () => {
  it("is enabled when the admin has the operation's x-permission", () => {
    can.mockImplementation((p) => p === "payouts.manage");
    render(
      <TooltipProvider>
        <GatedButton op="adminCreatePayout">New payout</GatedButton>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "New payout" })).toBeEnabled();
  });

  it("is disabled and names the missing permission otherwise", async () => {
    can.mockReturnValue(false);
    render(
      <TooltipProvider delayDuration={0}>
        <GatedButton op="adminCreatePayout">New payout</GatedButton>
      </TooltipProvider>,
    );
    const btn = screen.getByRole("button", { name: "New payout" });
    expect(btn).toBeDisabled();
    await userEvent.hover(btn.parentElement!);
    expect((await screen.findAllByText("Requires the payouts.manage permission")).length).toBeGreaterThan(0);
  });

  it("can be disabled for a state reason even with the permission", () => {
    can.mockReturnValue(true);
    render(
      <TooltipProvider>
        <GatedButton op="adminRetryTransfer" disabledReason="Only FAILED transfers can be retried">
          Retry
        </GatedButton>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });
});

describe("ConfirmDialog", () => {
  it("requires a 3+ character note, stays open while pending and shows server errors", async () => {
    const user = userEvent.setup();
    let reject!: (e: unknown) => void;
    const onConfirm = vi.fn(() => new Promise((_, r) => (reject = r)));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Resolve?" confirmLabel="Mark resolved" note={{ label: "What was done" }} onConfirm={onConfirm}>
        <p>Item text</p>
      </ConfirmDialog>,
    );
    const confirm = screen.getByRole("button", { name: "Mark resolved" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("What was done"), "ok");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("What was done"), " done");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("ok done");
    expect(screen.getByRole("button", { name: "Mark resolved" })).toBeDisabled(); // no double submit
    reject(new ApiError({ status: 409, code: "INVALID_STATE", message: "Item is RESOLVED" }));
    await waitFor(() => expect(screen.getByText("Item is RESOLVED")).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("StatusBadge", () => {
  it("colours by meaning", () => {
    expect(statusTone("COMPLETED")).toBe("green");
    expect(statusTone("PENDING")).toBe("amber");
    expect(statusTone("FAILED")).toBe("red");
    expect(statusTone("EXPIRED")).toBe("grey");
    render(<StatusBadge status="AUTO_RESOLVED" />);
    expect(screen.getByText("AUTO RESOLVED")).toBeInTheDocument();
  });
});
