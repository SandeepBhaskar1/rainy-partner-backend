const request = require("supertest");
const app = require("../../app");

describe("KYC Routes (/api/kyc)", () => {

  it("GET /api/kyc/kyc-approvals returns 401 without token", async () => {
    const res = await request(app).get("/api/kyc/kyc-approvals");
    expect(res.status).toBe(401);
  });

  describe("Authenticated KYC routes", () => {
    let adminToken;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/auth/admin-register")
        .send({
          email: "kyc-admin-test@test.com",
          password: "Test@1234",
          name: "KYC Admin"
        });
      adminToken = res.body.access_token;
    });

    it("GET /api/kyc/kyc-approvals returns pending and rejected lists", async () => {
      const res = await request(app)
        .get("/api/kyc/kyc-approvals")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pending");
      expect(res.body).toHaveProperty("rejected");
      expect(Array.isArray(res.body.pending)).toBe(true);
      expect(Array.isArray(res.body.rejected)).toBe(true);
    });

    it("POST /api/kyc/approve returns 401 with admin token (uses verifyToken, not verifyAdminToken)", async () => {
      const res = await request(app)
        .post("/api/kyc/approve")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ id: "000000000000000000000000", coordinator_id: "000000000000000000000001" });

      expect(res.status).toBe(401);
    });

    it("POST /api/kyc/reject returns 401 with admin token (uses verifyToken, not verifyAdminToken)", async () => {
      const res = await request(app)
        .post("/api/kyc/reject")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ id: "000000000000000000000000" });

      expect(res.status).toBe(401);
    });
  });

});