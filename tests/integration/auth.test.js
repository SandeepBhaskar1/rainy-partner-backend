const request = require("supertest");
const app = require("../../app");

describe("Auth Routes", () => {

  describe("POST /api/auth/admin-register", () => {

    it("should register a new user successfully", async () => {
      const res = await request(app)
        .post("/api/auth/admin-register")
        .send({
          email: `test${Date.now()}@example.com`,
          password: "Test@1234",
          phone: `9${Date.now().toString().slice(-9)}`,
          name: "Test User"
        });

      expect([200, 201]).toContain(res.status);
    });

    it("should reject registration with missing fields", async () => {
      const res = await request(app)
        .post("/api/auth/admin-register")
        .send({ email: "test@example.com" });

      expect(res.status).toBe(400);
    });

    it("should reject duplicate email", async () => {
      const user = {
        email: `duplicate${Date.now()}@example.com`,
        password: "Test@1234",
        phone: `8${Date.now().toString().slice(-9)}`,
        name: "Duplicate Admin"
      };

      await request(app).post("/api/auth/admin-register").send(user);
      const res = await request(app).post("/api/auth/admin-register").send(user);

      expect(res.status).toBe(400);
    });

  });

  describe("POST /api/auth/admin-login", () => {

    let loginUser;

    beforeEach(async () => {
      loginUser = {
        email: `login${Date.now()}@example.com`,
        password: "Test@1234",
        phone: `7${Date.now().toString().slice(-9)}`,
        name: "Login Test"
      };

      await request(app)
        .post("/api/auth/admin-register")
        .send(loginUser);
    });

    it("should login with valid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/admin-login")
        .send({
          email: loginUser.email,
          password: loginUser.password
        });

      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("should reject wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/admin-login")
        .send({
          email: loginUser.email,
          password: "WrongPassword"
        });

      expect(res.status).toBe(401);
    });

    it("should reject unknown email", async () => {
      const res = await request(app)
        .post("/api/auth/admin-login")
        .send({
          email: "ghost@example.com",
          password: "Test@1234"
        });

      expect(res.status).toBe(401);
    });

  });

});