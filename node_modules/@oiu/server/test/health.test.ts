import test from "node:test";
import assert from "node:assert/strict";
import { handleHealth } from "../dist/app.js";

test("handleHealth returns 200 with service info", () => {
  let statusCode = 0;
  let responseData: any = null;

  const mockReq = {} as any;
  const mockRes = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  } as any;

  handleHealth(mockReq, mockRes);

  assert.equal(statusCode, 200);
  assert.equal(responseData?.status, "ok");
  assert.equal(responseData?.service, "oiu-backend");
  assert.equal(typeof responseData?.uptime, "number");
});
