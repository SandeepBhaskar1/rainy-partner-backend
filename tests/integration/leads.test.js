const request = require("supertest");
const app = require("../../app");

describe("Leads Routes (/api/post-leads)", () => {

  it("GET /api/post-leads returns 401 without token", async () => {
    const res = await request(app).get("/api/post-leads");
    expect(res.status).toBe(401);
  });

  it("POST /api/post-leads returns 401 without token", async () => {
    const res = await request(app).post("/api/post-leads").send({});
    expect(res.status).toBe(401);
  });

  describe("POST /api/post-leads validation", () => {
    let adminToken;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/auth/admin-register")
        .send({
          email: "leads-admin-test@test.com",
          password: "Test@1234",
          name: "Leads Admin"
        });
      adminToken = res.body.access_token;
    });

    it("returns 400 when client info is missing", async () => {
      const res = await request(app)
        .post("/api/post-leads")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ model_purchased: "Model X" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBeTruthy();
    });

    it("creates a lead successfully with valid data", async () => {
      const res = await request(app)
        .post("/api/post-leads")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          client: {
            name: "Test Client",
            phone: "9876543210",
            address: "123 Street",
            city: "Mumbai",
            district: "Mumbai",
            state: "Maharashtra",
            pincode: "400001"
          },
          model_purchased: "Rainy Filter Pro"
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.message).toBe("Lead created successfully");
    });
  });

});