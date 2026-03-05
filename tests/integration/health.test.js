const request = require("supertest");
const app = require("../../app");

describe("Health Check", () => {
  it("GET /health returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/health returns healthy status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
  });

  it("GET unknown route returns 404", async () => {
    const res = await request(app).get("/api/nonexistent-route");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Route not found");
  });
});