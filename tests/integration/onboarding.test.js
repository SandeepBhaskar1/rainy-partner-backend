const request = require("supertest");
const app = require("../../app");
const mongoose = require("mongoose");

describe("Onboarding Routes", () => {

  it("GET /api/onboarding/:id returns 404 for unknown id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/onboarding/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/onboarding/:id returns 4xx or 5xx for invalid id format", async () => {
    const res = await request(app).get("/api/onboarding/invalid-id");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("POST /api/onboarding returns 400 when fields are missing", async () => {
    const res = await request(app)
      .post("/api/onboarding")
      .send({ phone: "9999999999" });
    expect(res.status).toBe(400);
  });

  it("POST /api/onboarding returns 404 for unknown phone", async () => {
    const res = await request(app)
      .post("/api/onboarding")
      .send({
        phone: "9999999999",
        name: "Test User",
        address: "123 Street",
        city: "Mumbai",
        district: "Mumbai",
        state: "Maharashtra",
        pin: "400001",
        service_area_pin: "400001",
        experience: 2,
        tools: "wrench",
        aadhaar_number: "123456789012",
        profile: "url",
        aadhaar_front: "url",
        aadhaar_back: "url"
      });
    expect(res.status).toBe(404);
  });

});