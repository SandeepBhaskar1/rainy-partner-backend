const request = require("supertest");
const app = require("../../app");

describe("Admin Routes (/api/admin)", () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/admin-register")
      .send({
        email: `admin${Date.now()}@test.com`,
        phone: `9${Date.now().toString().slice(-9)}`,
        password: "Test@1234",
        name: "Admin Routes Test"
      });
    adminToken = res.body.access_token;
  });

  // ── Auth required ─────────────────────────────────────────
  it("GET /api/admin/dashboard returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/plumbers returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/plumbers");
    expect(res.status).toBe(401);
  });

  // ── Authenticated ─────────────────────────────────────────
  it("GET /api/admin/dashboard returns overview stats", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("overview");
    expect(res.body.overview).toHaveProperty("total_plumbers");
    expect(res.body.overview).toHaveProperty("total_orders");
  });

  it("GET /api/admin/plumbers returns plumbers list", async () => {
    const res = await request(app)
      .get("/api/admin/plumbers")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("plumbers");
    expect(Array.isArray(res.body.plumbers)).toBe(true);
  });

  it("GET /api/admin/orders returns orders list", async () => {
    const res = await request(app)
      .get("/api/admin/orders")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("orders");
  });

  it("GET /api/admin/leads returns leads list", async () => {
    const res = await request(app)
      .get("/api/admin/leads")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("leads");
  });

  it("GET /api/admin/co-ordinators returns coordinators list", async () => {
    const res = await request(app)
      .get("/api/admin/co-ordinators")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("coordinators");
  });

  it("POST /api/admin/co-ordinator-registeration returns 400 when fields missing", async () => {
    const res = await request(app)
      .post("/api/admin/co-ordinator-registeration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test" });

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/co-ordinator-registeration creates coordinator", async () => {
    const res = await request(app)
      .post("/api/admin/co-ordinator-registeration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Coordinator",
        phone: `9${Date.now().toString().slice(-9)}`,
        email: `coordinator${Date.now()}@test.com`,
        password: "Test@1234"
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.message).toBe("Coordinator Created Successfully.");
  });

  it("GET /api/admin/jobs/pending-review returns array", async () => {
    const res = await request(app)
      .get("/api/admin/jobs/pending-review")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

});