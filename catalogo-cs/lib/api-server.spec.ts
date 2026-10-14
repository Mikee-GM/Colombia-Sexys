import { ApiError, apiFetch } from "./api-server";
import { getBackendCookieHeader } from "@/lib/auth";
import { redirect } from "next/navigation";

jest.mock("@/lib/auth", () => ({
  getBackendCookieHeader: jest.fn(),
  getCsrfToken: jest.fn().mockResolvedValue("csrf-test"),
  isRedirectError: (error: unknown) =>
    error instanceof Error && "digest" in error,
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT" });
  }),
}));

const originalFetch = global.fetch;

describe("apiFetch HTTP errors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getBackendCookieHeader).mockResolvedValue("access_token=test");
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([403, 404, 500])("preserves HTTP %s for its caller", async (status) => {
    jest.mocked(fetch).mockResolvedValue(
      Response.json({ message: "Error de prueba" }, { status }),
    );

    await expect(apiFetch("/services/test")).rejects.toMatchObject({
      name: "ApiError",
      message: "Error de prueba",
      status,
    });
  });

  it("remains compatible with Error consumers and array validation messages", async () => {
    jest.mocked(fetch).mockResolvedValue(
      Response.json({ message: ["Primer error", "Segundo error"] }, { status: 400 }),
    );

    await expect(apiFetch("/services/test")).rejects.toEqual(
      new ApiError("Primer error, Segundo error", 400),
    );
    expect(new ApiError("Prueba", 500)).toBeInstanceOf(Error);
  });

  it("redirects an expired session instead of converting it into an HTTP error", async () => {
    jest.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    await expect(apiFetch("/services/test")).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("keeps successful responses and authenticated no-store requests", async () => {
    jest.mocked(fetch).mockResolvedValue(Response.json([{ id: "test" }]));

    await expect(apiFetch("/services")).resolves.toEqual([{ id: "test" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/services"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ Cookie: "access_token=test" }),
      }),
    );
  });
});
