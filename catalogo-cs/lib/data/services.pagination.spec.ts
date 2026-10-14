import { apiFetch } from "@/lib/api-server";
import { getServices, getServicesAction } from "./services";

jest.mock("@/lib/api-server", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/auth", () => ({ isRedirectError: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const records = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({ id: `record-${index + offset}` }));

describe("complete administrative record reads", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns an empty list after one request", async () => {
    jest.mocked(apiFetch).mockResolvedValue([]);

    await expect(getServices()).resolves.toEqual([]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/services?limit=500&offset=0");
  });

  it("does not truncate records at the default backend limit of 200", async () => {
    const page = records(201);
    jest.mocked(apiFetch).mockResolvedValue(page);

    await expect(getServices()).resolves.toEqual(page);
    expect(apiFetch).toHaveBeenCalledWith("/services?limit=500&offset=0");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("combines pages beyond 500, preserving backend order", async () => {
    const all = records(501);
    jest.mocked(apiFetch)
      .mockResolvedValueOnce(all.slice(0, 500))
      .mockResolvedValueOnce(all.slice(500));

    await expect(getServices()).resolves.toEqual(all);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/services?limit=500&offset=0");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/services?limit=500&offset=500");
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("reads the terminal empty page when the total is an exact page multiple", async () => {
    const all = records(1000);
    jest.mocked(apiFetch)
      .mockResolvedValueOnce(all.slice(0, 500))
      .mockResolvedValueOnce(all.slice(500))
      .mockResolvedValueOnce([]);

    await expect(getServices()).resolves.toEqual(all);
    expect(apiFetch).toHaveBeenNthCalledWith(3, "/services?limit=500&offset=1000");
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it("does not return the first page when a later request fails", async () => {
    const failure = new Error("Backend no disponible");
    jest.mocked(apiFetch)
      .mockResolvedValueOnce(records(500))
      .mockRejectedValueOnce(failure);

    await expect(getServices()).rejects.toBe(failure);
  });

  it.each([
    ["empty body", undefined],
    ["object instead of array", {}],
    ["missing identifier", [{ id: "" }]],
    ["null record", [null]],
    ["oversized page", records(501)],
  ])(
    "rejects a malformed response: %s",
    async (_description, value) => {
      jest.mocked(apiFetch).mockResolvedValue(value);

      await expect(getServices()).rejects.toThrow("lista de servicios válida");
    },
  );

  it("does not return partial data when a later page is malformed", async () => {
    jest.mocked(apiFetch)
      .mockResolvedValueOnce(records(500))
      .mockResolvedValueOnce({ items: records(1, 500) });

    await expect(getServices()).rejects.toThrow("lista de servicios válida");
  });

  it("stops an API that ignores offset instead of looping forever", async () => {
    jest.mocked(apiFetch).mockResolvedValue(records(500));

    await expect(getServices()).rejects.toThrow("cambió durante la lectura");
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects overlapping pages rather than silently showing partial totals", async () => {
    jest.mocked(apiFetch)
      .mockResolvedValueOnce(records(500))
      .mockResolvedValueOnce(records(2, 499));

    await expect(getServices()).rejects.toThrow("cambió durante la lectura");
  });

  it("uses the same complete reader for the action alias", async () => {
    const all = records(501);
    jest.mocked(apiFetch)
      .mockResolvedValueOnce(all.slice(0, 500))
      .mockResolvedValueOnce(all.slice(500));

    await expect(getServicesAction()).resolves.toEqual(all);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
