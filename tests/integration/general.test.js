const request = require("supertest");
const app = require("../../app");

describe("General Routes", () => {

  it("GET /api/products returns array", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/config returns config object", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("install_fee_default");
  });

  it("GET /api/delete-account-request returns HTML page", async () => {
    const res = await request(app).get("/api/delete-account-request");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Account Deletion");
  });

});