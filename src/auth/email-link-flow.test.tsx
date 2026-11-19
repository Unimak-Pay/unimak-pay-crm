import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPIRED_LINK_MESSAGE } from "./email-link-shared";

const verifyEmailLink = vi.fn();
const setNewPassword = vi.fn();
const reload = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("./email-link", () => ({ verifyEmailLink: (...a: unknown[]) => verifyEmailLink(...a), setNewPassword: (...a: unknown[]) => setNewPassword(...a) }));
vi.mock("@/auth/auth-provider", () => ({ useAuth: () => ({ status: "signed_out", reload }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search, useRouter: () => ({ replace }) }));

const { EmailLinkFlow } = await import("./email-link-flow");

const copy = {
  title: "Welcome to UNIMAK Fees Admin",
  intro: "intro",
  button: "Accept invitation",
  expired: EXPIRED_LINK_MESSAGE,
  expiredLink: { href: "/sign-in", label: "Go to sign in" },
  passwordTitle: "Choose your password",
};

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams("token_hash=abc123&type=invite");
});

describe("accept invite", () => {
  it("rendering the page does not verify the token (link scanners)", () => {
    render(<EmailLinkFlow type="invite" copy={copy} />);
    expect(screen.getByText("Welcome to UNIMAK Fees Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
    expect(verifyEmailLink).not.toHaveBeenCalled();
  });

  it("clicking Accept verifies, then asks for a 12+ character password that matches", async () => {
    const user = userEvent.setup();
    verifyEmailLink.mockResolvedValue({ ok: true });
    setNewPassword.mockResolvedValue(undefined);
    render(<EmailLinkFlow type="invite" copy={copy} />);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(verifyEmailLink).toHaveBeenCalledExactlyOnceWith("abc123", "invite");
    expect(await screen.findByText("Choose your password")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText("At least 12 characters")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "correct horse battery");
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "correct horse batterY");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();
    expect(setNewPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(setNewPassword).toHaveBeenCalledWith("correct horse battery"));
    expect(reload).toHaveBeenCalled(); // continues into the normal sign-in flow (aal → 2FA → /me)
  });

  it("an expired or used token shows the re-send message and a sign-in link", async () => {
    const user = userEvent.setup();
    verifyEmailLink.mockResolvedValue({ ok: false, reason: "expired" });
    render(<EmailLinkFlow type="invite" copy={copy} />);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(EXPIRED_LINK_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("a missing token_hash shows the same message without calling Supabase", () => {
    search = new URLSearchParams("type=invite");
    render(<EmailLinkFlow type="invite" copy={copy} />);
    expect(screen.getByText(EXPIRED_LINK_MESSAGE)).toBeInTheDocument();
    expect(verifyEmailLink).not.toHaveBeenCalled();
  });
});
