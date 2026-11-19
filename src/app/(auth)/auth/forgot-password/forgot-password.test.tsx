import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const requestPasswordReset = vi.fn();
vi.mock("@/auth/email-link", () => ({ requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a) }));
const { ForgotPassword, RESET_SENT_MESSAGE } = await import("./forgot-password");

describe("forgot password", () => {
  it.each([
    ["an existing account", () => Promise.resolve()],
    ["an unknown email", () => Promise.resolve()], // Supabase answers the same; requestPasswordReset never throws
  ])("shows the same message for %s", async (_label, impl) => {
    requestPasswordReset.mockImplementation(impl);
    const user = userEvent.setup();
    render(<ForgotPassword />);
    await user.type(screen.getByLabelText("Email"), "Someone@Unimak.edu.sl ");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(RESET_SENT_MESSAGE);
    expect(requestPasswordReset).toHaveBeenLastCalledWith("someone@unimak.edu.sl");
  });
});
