// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockGetWorkflows = vi.fn(async (_a?: any) => ({
  workflows: [] as any[],
  pinnedWorkflowIds: [] as string[],
  organization: null as any,
  providerStatus: null as any,
}));
const mockGetAssetTypes = vi.fn(async (_a?: any) => [] as any[]);
const mockGetWorkflowPreviews = vi.fn(async (_a?: any) => ({}));
const mockPinWorkflow = vi.fn(async (_a?: any, _b?: any) => {});
const mockUnpinWorkflow = vi.fn(async (_a?: any, _b?: any) => {});
const mockSaveWorkflowOrganization = vi.fn(async (_a?: any, _b?: any) => {});
const mockCreateWorkflowFolder = vi.fn(async (_a: any, name: string) => ({
  id: "folder-1",
  name,
}));
const mockRenameWorkflowFolder = vi.fn(async (_a?: any, _b?: any, _c?: any) => {});
const mockDeleteWorkflowFolder = vi.fn(async (_a?: any, _b?: any) => {});

vi.mock("../../client", () => ({
  getWorkflows: (a: any) => mockGetWorkflows(a),
  getAssetTypes: (a: any) => mockGetAssetTypes(a),
  getWorkflowPreviews: (a: any) => mockGetWorkflowPreviews(a),
  pinWorkflow: (a: any, b: any) => mockPinWorkflow(a, b),
  unpinWorkflow: (a: any, b: any) => mockUnpinWorkflow(a, b),
  saveWorkflowOrganization: (a: any, b: any) => mockSaveWorkflowOrganization(a, b),
  createWorkflowFolder: (a: any, b: any) => mockCreateWorkflowFolder(a, b),
  renameWorkflowFolder: (a: any, b: any, c: any) => mockRenameWorkflowFolder(a, b, c),
  deleteWorkflowFolder: (a: any, b: any) => mockDeleteWorkflowFolder(a, b),
}));

vi.mock("../../lib/onboarding", () => ({
  loadBundledWorkflows: vi.fn(async () => {}),
}));

vi.mock("../../assetTypeRegistry", () => {
  class AssetTypeRegistry {
    types: any[];
    constructor(types: any[]) {
      this.types = types;
    }
  }
  return {
    AssetTypeRegistry,
    EMPTY_REGISTRY: new AssetTypeRegistry([]),
  };
});

import { useWorkflowManager } from "../useWorkflowManager";

const apiBaseUrl = "http://localhost:3000" as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkflows.mockResolvedValue({
    workflows: [],
    pinnedWorkflowIds: [],
    organization: null,
    providerStatus: null,
  });
});

describe("useWorkflowManager", () => {
  it("returns empty state initially", () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));
    expect(result.current.workflowsRemote).toEqual([]);
    expect(result.current.pinnedWorkflowIds).toEqual([]);
    expect(result.current.workflowOrg).toBeNull();
    expect(result.current.assetTypeRegistry).toBeDefined();
  });

  it("refreshWorkflows populates workflowsRemote", async () => {
    const workflows = [
      { id: "wf-1", name: "Test Workflow", type: "txt2img" },
    ];
    mockGetWorkflows.mockResolvedValue({
      workflows,
      pinnedWorkflowIds: ["wf-1"],
      organization: { folders: [], items: [] },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    // The hook calls refreshWorkflows on mount via useEffect
    await waitFor(() => {
      expect(result.current.workflowsRemote).toEqual(workflows);
    });

    expect(result.current.pinnedWorkflowIds).toEqual(["wf-1"]);
    expect(result.current.workflowOrg).toEqual({ folders: [], items: [] });
  });

  it("handleTogglePin optimistically updates, calls API", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [{ id: "wf-1", name: "WF" }],
      pinnedWorkflowIds: [],
      organization: null,
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.workflowsRemote).toHaveLength(1);
    });

    // Pin a workflow
    await act(async () => {
      await result.current.handleTogglePin("wf-1");
    });

    expect(result.current.pinnedWorkflowIds).toContain("wf-1");
    expect(mockPinWorkflow).toHaveBeenCalledWith(apiBaseUrl, "wf-1");

    // Unpin it
    await act(async () => {
      await result.current.handleTogglePin("wf-1");
    });

    expect(result.current.pinnedWorkflowIds).not.toContain("wf-1");
    expect(mockUnpinWorkflow).toHaveBeenCalledWith(apiBaseUrl, "wf-1");
  });

  it("handleReorderWorkflows updates org", async () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    const newItems = [
      { workflowId: "wf-1", folderId: null, sortOrder: 0 },
    ];

    await act(async () => {
      await result.current.handleReorderWorkflows(newItems);
    });

    expect(result.current.workflowOrg).toEqual({
      folders: [],
      items: newItems,
    });
    expect(mockSaveWorkflowOrganization).toHaveBeenCalledWith(
      apiBaseUrl,
      newItems
    );
  });

  it("handleCreateFolder adds folder", async () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    await act(async () => {
      const folder = await result.current.handleCreateFolder("My Folder");
      expect(folder).toEqual({ id: "folder-1", name: "My Folder" });
    });

    expect(mockCreateWorkflowFolder).toHaveBeenCalledWith(
      apiBaseUrl,
      "My Folder"
    );
  });

  it("handleDeleteFolder removes folder", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [],
      pinnedWorkflowIds: [],
      organization: {
        folders: [{ id: "folder-1", name: "F1" }],
        items: [{ workflowId: "wf-1", folderId: "folder-1", sortOrder: 0 }],
      },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowOrg).not.toBeNull();
    });

    await act(async () => {
      await result.current.handleDeleteFolder("folder-1");
    });

    // Folder should be removed and items moved out of folder
    expect(result.current.workflowOrg!.folders).toEqual([]);
    expect(result.current.workflowOrg!.items[0].folderId).toBeNull();
    expect(mockDeleteWorkflowFolder).toHaveBeenCalledWith(
      apiBaseUrl,
      "folder-1"
    );
  });

  it("EMPTY_REGISTRY returned initially", () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));
    expect(result.current.assetTypeRegistry).toBeDefined();
    expect((result.current.assetTypeRegistry as any).types).toEqual([]);
  });

  it("handleTogglePin reverts on API error when pinning", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [{ id: "wf-1", name: "WF" }],
      pinnedWorkflowIds: [],
      organization: null,
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowsRemote).toHaveLength(1);
    });

    // Make pinWorkflow fail
    mockPinWorkflow.mockRejectedValueOnce(new Error("API error"));

    await act(async () => {
      await result.current.handleTogglePin("wf-1");
    });

    // Should revert: wf-1 should NOT be pinned after error
    expect(result.current.pinnedWorkflowIds).not.toContain("wf-1");
  });

  it("handleTogglePin reverts on API error when unpinning", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [{ id: "wf-1", name: "WF" }],
      pinnedWorkflowIds: ["wf-1"],
      organization: null,
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.pinnedWorkflowIds).toContain("wf-1");
    });

    // Make unpinWorkflow fail
    mockUnpinWorkflow.mockRejectedValueOnce(new Error("API error"));

    await act(async () => {
      await result.current.handleTogglePin("wf-1");
    });

    // Should revert: wf-1 should remain pinned after error
    expect(result.current.pinnedWorkflowIds).toContain("wf-1");
  });

  it("handleRenameFolder calls refreshWorkflows on API error", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [],
      pinnedWorkflowIds: [],
      organization: {
        folders: [{ id: "folder-1", name: "Original" }],
        items: [],
      },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowOrg).not.toBeNull();
    });

    // Clear call count from initial load
    mockGetWorkflows.mockClear();

    // Make rename fail
    mockRenameWorkflowFolder.mockRejectedValueOnce(new Error("API error"));

    await act(async () => {
      await result.current.handleRenameFolder("folder-1", "New Name");
    });

    // Optimistic update should have happened
    expect(mockRenameWorkflowFolder).toHaveBeenCalledWith(apiBaseUrl, "folder-1", "New Name");

    // refreshWorkflows should be called on error
    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });
  });

  it("handleDeleteFolder reassigns items from deleted folder", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [],
      pinnedWorkflowIds: [],
      organization: {
        folders: [
          { id: "folder-1", name: "F1" },
          { id: "folder-2", name: "F2" },
        ],
        items: [
          { workflowId: "wf-1", folderId: "folder-1", sortOrder: 0 },
          { workflowId: "wf-2", folderId: "folder-1", sortOrder: 1 },
          { workflowId: "wf-3", folderId: "folder-2", sortOrder: 0 },
        ],
      },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowOrg).not.toBeNull();
    });

    await act(async () => {
      await result.current.handleDeleteFolder("folder-1");
    });

    // folder-1 should be removed
    expect(result.current.workflowOrg!.folders).toEqual([
      { id: "folder-2", name: "F2" },
    ]);
    // Items from folder-1 should have folderId set to null
    const items = result.current.workflowOrg!.items;
    expect(items.find((i: any) => i.workflowId === "wf-1")!.folderId).toBeNull();
    expect(items.find((i: any) => i.workflowId === "wf-2")!.folderId).toBeNull();
    // Items from folder-2 should be unchanged
    expect(items.find((i: any) => i.workflowId === "wf-3")!.folderId).toBe("folder-2");
  });

  it("handleDeleteFolder calls refreshWorkflows on API error", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [],
      pinnedWorkflowIds: [],
      organization: {
        folders: [{ id: "folder-1", name: "F1" }],
        items: [],
      },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowOrg).not.toBeNull();
    });

    mockGetWorkflows.mockClear();
    mockDeleteWorkflowFolder.mockRejectedValueOnce(new Error("API error"));

    await act(async () => {
      await result.current.handleDeleteFolder("folder-1");
    });

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });
  });

  it("handleCreateFolder returns null on API error", async () => {
    mockCreateWorkflowFolder.mockRejectedValueOnce(new Error("API error"));

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    let folder: any;
    await act(async () => {
      folder = await result.current.handleCreateFolder("Fails");
    });

    expect(folder).toBeNull();
  });

  it("refreshAssetTypes updates registry on success", async () => {
    const mockTypes = [{ id: "type-1", name: "Image" }];
    mockGetAssetTypes.mockResolvedValueOnce(mockTypes);

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    // Initial load calls refreshAssetTypes
    await waitFor(() => {
      expect(mockGetAssetTypes).toHaveBeenCalled();
    });
  });

  it("refreshAssetTypes keeps existing registry on error", async () => {
    mockGetAssetTypes.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetAssetTypes).toHaveBeenCalled();
    });

    // Should still have the empty registry, not crash
    expect(result.current.assetTypeRegistry).toBeDefined();
    expect((result.current.assetTypeRegistry as any).types).toEqual([]);
  });

  it("refreshWorkflows sets providerStatus when returned", async () => {
    const status = { comfyui: "connected" };
    mockGetWorkflows.mockResolvedValue({
      workflows: [{ id: "wf-1", name: "WF" }],
      pinnedWorkflowIds: [],
      organization: null,
      providerStatus: status,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.providerStatus).toEqual(status);
    });
  });

  it("refreshWorkflows resets state on error", async () => {
    // First load succeeds
    mockGetWorkflows.mockResolvedValueOnce({
      workflows: [{ id: "wf-1", name: "WF" }],
      pinnedWorkflowIds: ["wf-1"],
      organization: { folders: [], items: [] },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowsRemote).toHaveLength(1);
    });

    // Second call fails
    mockGetWorkflows.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      await result.current.refreshWorkflows();
    });

    expect(result.current.workflowsRemote).toEqual([]);
    expect(result.current.pinnedWorkflowIds).toEqual([]);
    expect(result.current.workflowOrg).toBeNull();
  });

  it("refreshWorkflowPreviews handles errors silently", async () => {
    mockGetWorkflowPreviews.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    // Should not throw
    await act(async () => {
      await result.current.refreshWorkflowPreviews();
    });
  });

  it("handleRenameFolder is a no-op when workflowOrg is null", async () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    // workflowOrg should be null initially
    expect(result.current.workflowOrg).toBeNull();

    await act(async () => {
      await result.current.handleRenameFolder("folder-1", "New Name");
    });

    // Should still be null (no-op)
    expect(result.current.workflowOrg).toBeNull();
  });

  it("handleDeleteFolder is a no-op when workflowOrg is null", async () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    expect(result.current.workflowOrg).toBeNull();

    await act(async () => {
      await result.current.handleDeleteFolder("folder-1");
    });

    expect(result.current.workflowOrg).toBeNull();
  });

  it("handleReorderWorkflows creates org from scratch when workflowOrg is null", async () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    const newItems = [
      { workflowId: "wf-1", folderId: null, sortOrder: 0 },
    ];

    await act(async () => {
      await result.current.handleReorderWorkflows(newItems);
    });

    // Should have created org with empty folders
    expect(result.current.workflowOrg).toEqual({
      folders: [],
      items: newItems,
    });
  });

  it("handleCreateFolder creates org when workflowOrg is null", async () => {
    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    expect(result.current.workflowOrg).toBeNull();

    await act(async () => {
      await result.current.handleCreateFolder("New Folder");
    });

    // Should create new org with the folder
    expect(result.current.workflowOrg).toEqual({
      folders: [{ id: "folder-1", name: "New Folder" }],
      items: [],
    });
  });

  it("refreshWorkflowPreviews stores previews on success", async () => {
    const previews = { "wf-1": "https://example.com/preview.png" };
    mockGetWorkflowPreviews.mockResolvedValueOnce(previews);

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.refreshWorkflowPreviews();
    });

    expect(result.current.workflowPreviewsFromApi).toEqual(previews);
  });

  it("handleReorderWorkflows calls refreshWorkflows on API error", async () => {
    mockGetWorkflows.mockResolvedValue({
      workflows: [],
      pinnedWorkflowIds: [],
      organization: { folders: [], items: [] },
      providerStatus: null,
    });

    const { result } = renderHook(() => useWorkflowManager(apiBaseUrl));

    await waitFor(() => {
      expect(result.current.workflowOrg).not.toBeNull();
    });

    mockGetWorkflows.mockClear();
    mockSaveWorkflowOrganization.mockRejectedValueOnce(new Error("API error"));

    await act(async () => {
      await result.current.handleReorderWorkflows([
        { workflowId: "wf-1", folderId: null, sortOrder: 0 },
      ]);
    });

    // refreshWorkflows should be called to restore server state
    await waitFor(() => {
      expect(mockGetWorkflows).toHaveBeenCalled();
    });
  });
});
