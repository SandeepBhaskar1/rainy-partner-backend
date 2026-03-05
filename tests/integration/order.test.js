const request = require("supertest");
const app = require("../../app");

describe("Orders Routes", () => {
  it("GET /api/orders/orders returns array", async () => {
    const res = await request(app).get("/api/orders/orders");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});