import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const agentId = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const companyId = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const projectId = "cccc0000-cccc-4ccc-8ccc-cccccccccccc";

const issueWithProject = {
  id: "issue-in-project",
  identifier: "RUS-100",
  title: "Issue in project",
  status: "todo" as const,
  priority: "medium" as const,
  projectId,
  goalId: null,
  parentId: null,
  updatedAt: new Date("2026-01-01"),
  activeRun: null,
};

const issueNoProject = {
  id: "issue-no-project",
  identifier: "RUS-200",
  title: "Issue with no project",
  status: "todo" as const,
  priority: "medium" as const,
  projectId: null,
  goalId: null,
  parentId: null,
  updatedAt: new Date("2026-01-01"),
  activeRun: null,
};

const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  agentService: () => ({ getById: vi.fn(), getChainOfCommand: vi.fn().mockResolvedValue([]) }),
  agentInstructionsService: () => ({ materializeManagedBundle: vi.fn() }),
  accessService: () => ({
    canUser: vi.fn(),
    hasPermission: vi.fn(),
    getMembership: vi.fn(),
    ensureMembership: vi.fn(),
    listPrincipalGrants: vi.fn().mockResolvedValue([]),
    setPrincipalPermission: vi.fn(),
  }),
  approvalService: () => ({ create: vi.fn(), getById: vi.fn() }),
  companySkillService: () => ({
    listRuntimeSkillEntries: vi.fn().mockResolvedValue([]),
    resolveRequestedSkillKeys: vi.fn().mockImplementation(async (_id: string, req: string[]) => req),
  }),
  budgetService: () => ({ upsertPolicy: vi.fn() }),
  heartbeatService: () => ({ listTaskSessions: vi.fn(), resetRuntimeSession: vi.fn() }),
  issueApprovalService: () => ({ linkManyForApproval: vi.fn() }),
  issueService: () => mockIssueService,
  logActivity: vi.fn().mockResolvedValue(undefined),
  secretService: () => ({
    normalizeAdapterConfigForPersistence: vi.fn().mockImplementation(async (_id: string, cfg: unknown) => cfg),
    resolveAdapterConfigForRuntime: vi.fn().mockImplementation(async (_id: string, cfg: unknown) => ({ config: cfg })),
  }),
  syncInstructionsBundleConfigFromFilePath: vi.fn((_agent: unknown, config: unknown) => config),
  workspaceOperationService: () => ({}),
}));

function createAgentActor() {
  return {
    type: "agent",
    agentId,
    companyId,
    source: "jwt",
  };
}

function createDbStub() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: vi.fn().mockResolvedValue([{ id: companyId, name: "Test Co", requireBoardApprovalForNewAgents: false }]),
        }),
      }),
    }),
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = createAgentActor();
    next();
  });
  app.use("/api", agentRoutes(createDbStub() as any));
  app.use(errorHandler);
  return app;
}

describe("GET /agents/me/inbox-lite — project scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all assigned issues when no currentIssueId is provided", async () => {
    mockIssueService.list.mockResolvedValue([issueWithProject, issueNoProject]);

    const res = await request(createApp()).get("/api/agents/me/inbox-lite");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(mockIssueService.list).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({ assigneeAgentId: agentId, status: "todo,in_progress,blocked" }),
    );
    // No projectId filter applied
    expect(mockIssueService.list).toHaveBeenCalledWith(
      companyId,
      expect.not.objectContaining({ projectId: expect.anything() }),
    );
  });

  it("scopes inbox to matching project when currentIssueId belongs to a project", async () => {
    const currentIssue = { ...issueWithProject, projectId };
    mockIssueService.getById.mockResolvedValue(currentIssue);
    mockIssueService.list.mockResolvedValue([issueWithProject]);

    const res = await request(createApp())
      .get("/api/agents/me/inbox-lite")
      .query({ currentIssueId: "issue-in-project" });

    expect(res.status).toBe(200);
    expect(mockIssueService.getById).toHaveBeenCalledWith("issue-in-project");
    expect(mockIssueService.list).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({ assigneeAgentId: agentId, projectId }),
    );
  });

  it("scopes inbox to no-project issues when currentIssueId has no project", async () => {
    mockIssueService.getById.mockResolvedValue({ ...issueNoProject, projectId: null });
    mockIssueService.list.mockResolvedValue([issueNoProject]);

    const res = await request(createApp())
      .get("/api/agents/me/inbox-lite")
      .query({ currentIssueId: "issue-no-project" });

    expect(res.status).toBe(200);
    expect(mockIssueService.list).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({ assigneeAgentId: agentId, projectId: null }),
    );
  });

  it("falls back to unscoped inbox when currentIssueId is not found", async () => {
    mockIssueService.getById.mockResolvedValue(null);
    mockIssueService.list.mockResolvedValue([issueWithProject, issueNoProject]);

    const res = await request(createApp())
      .get("/api/agents/me/inbox-lite")
      .query({ currentIssueId: "nonexistent-issue" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(mockIssueService.list).toHaveBeenCalledWith(
      companyId,
      expect.not.objectContaining({ projectId: expect.anything() }),
    );
  });

  it("returns 401 when called without agent authentication", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = { type: "board", userId: "user-1", companyIds: [companyId] };
      next();
    });
    app.use("/api", agentRoutes(createDbStub() as any));
    app.use(errorHandler);

    const res = await request(app).get("/api/agents/me/inbox-lite");
    expect(res.status).toBe(401);
  });
});
