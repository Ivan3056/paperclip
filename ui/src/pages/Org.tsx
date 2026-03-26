import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ChevronRight, GitBranch, MoreVertical, LayoutDashboard, FileText, Wrench, Settings, Activity, CreditCard, Trash2 } from "lucide-react";
import { cn, agentUrl } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AgentContextMenuProps {
  agentId: string;
  agentName: string;
  companyId: string;
  onSuccess?: () => void;
}

function AgentContextMenu({ agentId, agentName, companyId, onSuccess }: AgentContextMenuProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const handleAction = (action: string) => {
    switch (action) {
      case "dashboard":
        navigate(`/agents/${agentId}`);
        break;
      case "instructions":
        navigate(`/agents/${agentId}/instructions`);
        break;
      case "skills":
        navigate(`/agents/${agentId}/skills`);
        break;
      case "configuration":
        navigate(`/agents/${agentId}/configure`);
        break;
      case "runs":
        navigate(`/agents/${agentId}/runs`);
        break;
      case "budget":
        navigate(`/agents/${agentId}/budget`);
        break;
      case "delete":
        handleDelete();
        break;
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Are you sure you want to delete "${agentName}"? This action cannot be undone.`);

    if (!confirmed) return;

    try {
      await agentsApi.remove(agentId, companyId);
      pushToast({
        title: "Agent deleted",
        body: `"${agentName}" has been deleted successfully.`,
        tone: "success",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.org(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
      onSuccess?.();
    } catch (error) {
      pushToast({
        title: "Failed to delete agent",
        body: error instanceof Error ? error.message : "An unknown error occurred",
        tone: "error",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.preventDefault()}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleAction("dashboard")}>
          <LayoutDashboard className="mr-2 h-4 w-4" />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("instructions")}>
          <FileText className="mr-2 h-4 w-4" />
          Instructions
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("skills")}>
          <Wrench className="mr-2 h-4 w-4" />
          Skills
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("configuration")}>
          <Settings className="mr-2 h-4 w-4" />
          Configuration
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("runs")}>
          <Activity className="mr-2 h-4 w-4" />
          Runs
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("budget")}>
          <CreditCard className="mr-2 h-4 w-4" />
          Budget
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => handleAction("delete")}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgTree({
  nodes,
  depth = 0,
  hrefFn,
}: {
  nodes: OrgNode[];
  depth?: number;
  hrefFn: (id: string) => string;
}) {
  return (
    <div>
      {nodes.map((node) => (
        <OrgTreeNode key={node.id} node={node} depth={depth} hrefFn={hrefFn} />
      ))}
    </div>
  );
}

function OrgTreeNode({
  node,
  depth,
  hrefFn,
}: {
  node: OrgNode;
  depth: number;
  hrefFn: (id: string) => string;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.reports.length > 0;
  const { selectedCompanyId } = useCompany();

  return (
    <div>
      <Link
        to={hrefFn(node.id)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer hover:bg-accent/50 no-underline text-inherit"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren ? (
          <button
            className="p-0.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            node.status === "active"
              ? "bg-green-400"
              : node.status === "paused"
                ? "bg-yellow-400"
                : node.status === "pending_approval"
                  ? "bg-amber-400"
                : node.status === "error"
                  ? "bg-red-400"
                  : "bg-neutral-400"
          )}
        />
        <span className="font-medium flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground">{node.role}</span>
        <StatusBadge status={node.status} />
        {selectedCompanyId && (
          <div onClick={(e) => e.preventDefault()}>
            <AgentContextMenu
              agentId={node.id}
              agentName={node.name}
              companyId={selectedCompanyId}
            />
          </div>
        )}
      </Link>
      {hasChildren && expanded && (
        <OrgTree nodes={node.reports} depth={depth + 1} hrefFn={hrefFn} />
      )}
    </div>
  );
}

export function Org() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={GitBranch} message="Select a company to view org chart." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && data.length === 0 && (
        <EmptyState
          icon={GitBranch}
          message="No agents in the organization. Create agents to build your org chart."
        />
      )}

      {data && data.length > 0 && (
        <div className="border border-border py-1">
          <OrgTree nodes={data} hrefFn={(id) => `/agents/${id}`} />
        </div>
      )}
    </div>
  );
}
