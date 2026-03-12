export const queryKeys = {
  tasks: {
    all: ["tasks"] as const,
    list: (filter?: string) => [...queryKeys.tasks.all, "list", filter ?? "all"] as const,
  },
  batches: {
    all: ["batches"] as const,
    list: (filter?: string) => [...queryKeys.batches.all, "list", filter ?? "all"] as const,
  },
  schedules: {
    all: ["schedules"] as const,
    list: () => [...queryKeys.schedules.all, "list"] as const,
  },
  stats: {
    queues: ["stats", "queues"] as const,
  },
} as const;
