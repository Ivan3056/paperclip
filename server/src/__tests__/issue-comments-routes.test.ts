import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  listComments: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    canUser: vi.fn(),
    hasPermission: vi.fn(),
  }),
  agentService: () => ({
    getById: vi.fn(),
  }),
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  goalService: () => ({}),
  heartbeatService: () => ({
    wakeup: vi.fn(async () => undefined),
    reportRunActivity: vi.fn(async () => undefined),
  }),
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: vi.fn(async () => undefined),
  projectService: () => ({}),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({
    listForIssue: vi.fn(async () => []),
  }),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

const issue = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "company-1",
  status: "todo",
  assigneeAgentId: null,
  assigneeUserId: null,
  createdByUserId: "local-board",
  identifier: "PAP-581",
  title: "Incremental comments",
};

describe("issue comments routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.listComments.mockResolvedValue([]);
  });

  it.each(["after", "afterCommentId"])(
    "rejects invalid %s cursors before hitting the service",
    async (cursorParam) => {
      const res = await request(createApp()).get(
        `/api/issues/11111111-1111-4111-8111-111111111111/comments?${cursorParam}=does-not-exist&order=asc`,
      );

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid after comment id" });
      expect(mockIssueService.listComments).not.toHaveBeenCalled();
    },
  );

  it.each(["after", "afterCommentId"])("passes through valid UUID %s cursors", async (cursorParam) => {
    const afterCommentId = "22222222-2222-4222-8222-222222222222";

    const res = await request(createApp())
      .get(
        `/api/issues/11111111-1111-4111-8111-111111111111/comments?${cursorParam}=${afterCommentId}&order=asc`,
      );

    expect(res.status).toBe(200);
    expect(mockIssueService.listComments).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        afterCommentId,
        order: "asc",
        limit: null,
      },
    );
  });
});
