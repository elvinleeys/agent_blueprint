export function GET(): Response {
  return Response.json({ error: { code: "not_implemented" } }, { status: 501 });
}
