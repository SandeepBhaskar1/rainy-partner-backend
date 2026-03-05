const request = require("supertest");
const app = require("../../app");

describe("Plumber Routes", () => {

  // ── Public stats (no auth required) ──────────────────────
  describe("GET /api/plumber/stats", () => {
    it("returns plumber stats object", async () => {
      const res = await request(app).get("/api/plumber/stats");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("plumbers");
      expect(res.body).toHaveProperty("orders");
      expect(res.body).toHaveProperty("leads");
    });
  });

  // ── Auth-protected endpoints return 401 without token ────
  describe("Protected endpoints reject unauthenticated requests", () => {
    it("GET /api/plumber/profile returns 401 without token", async () => {
      const res = await request(app).get("/api/plumber/profile");
      expect(res.status).toBe(401);
    });

    it("GET /api/plumber/assigned-jobs returns 401 without token", async () => {
      const res = await request(app).get("/api/plumber/assigned-jobs");
      expect(res.status).toBe(401);
    });

    it("GET /api/plumber/completed-jobs returns 401 without token", async () => {
      const res = await request(app).get("/api/plumber/completed-jobs");
      expect(res.status).toBe(401);
    });

    it("GET /api/plumber/orders returns 401 without token", async () => {
      const res = await request(app).get("/api/plumber/orders");
      expect(res.status).toBe(401);
    });

    it("GET /api/plumber/check-deletion-eligibility returns 401 without token", async () => {
      const res = await request(app).get("/api/plumber/check-deletion-eligibility");
      expect(res.status).toBe(401);
    });
  });

  // ── Validation tests ─────────────────────────────────────
  describe("POST /api/plumber/place-order validation", () => {
    it("returns 401 without token", async () => {
      const res = await request(app)
        .post("/api/plumber/place-order")
        .send({});
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/plumber/jobs/submit-completion validation", () => {
    it("returns 401 without token", async () => {
      const res = await request(app)
        .post("/api/plumber/jobs/submit-completion")
        .send({});
      expect(res.status).toBe(401);
    });
  });

});