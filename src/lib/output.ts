export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function error(message: string, details?: unknown): never {
  console.error(
    JSON.stringify(
      { error: message, ...(details ? { details } : {}) },
      null,
      2,
    ),
  );
  process.exit(1);
}
