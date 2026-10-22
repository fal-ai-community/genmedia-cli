import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cleanCertificates, secureFetch } from "./tls";

const nativeFetch = globalThis.fetch;
const g3 = readFileSync(
  new URL("./fixtures/emsign-g3.pem", import.meta.url),
  "utf8",
);
const aaa = readFileSync(
  new URL("./fixtures/aaa.pem", import.meta.url),
  "utf8",
);
const good = cleanCertificates(
  readFileSync(new URL("./public-ca-bundle.pem", import.meta.url), "utf8"),
)[0];

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

describe("exclusive certificate trust", () => {
  test("removes both affected roots and preserves unrelated configured trust", () => {
    expect(cleanCertificates(`${g3}\n${good}\n${aaa}`)).toEqual([good]);
  });

  test("rejects an invalid CA file instead of using runtime defaults", () => {
    expect(() => cleanCertificates("not a certificate")).toThrow(
      "no PEM certificates",
    );
  });

  test("keeps explicit client CA selection and certificate verification", async () => {
    const fetchMock = mock(
      async (
        _input: unknown,
        init: RequestInit & { tls?: Bun.TLSOptions } = {},
      ) => {
        expect(init.tls?.ca).toEqual([good]);
        expect(init.tls?.rejectUnauthorized).toBe(true);
        return new Response("ok");
      },
    );
    globalThis.fetch = Object.assign(fetchMock, { preconnect() {} });
    await secureFetch("https://private.example/", {
      tls: { ca: `${g3}\n${good}`, rejectUnauthorized: false },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("does not fall back to bundled roots when a client CA store is fully distrusted", async () => {
    const fetchMock = mock(async () => new Response("unexpected"));
    globalThis.fetch = Object.assign(fetchMock, { preconnect() {} });
    await expect(
      secureFetch("https://private.example/", { tls: { ca: g3 } }),
    ).rejects.toThrow("only distrusted");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
