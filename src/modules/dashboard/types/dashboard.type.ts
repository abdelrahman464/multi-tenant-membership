export type PublicDashboard = {
  timezone: string;
  currency: string;
  from: string;
  to: string;
  members: {
    active: number;
    archived: number;
    joined: number;
  };
  subscriptions: {
    active: number;
    frozen: number;
    inGrace: number;
    expired: number;
    cancelled: number;
    endingSoon: number;
    completedUnrenewed: number;
  };
  checkIns: {
    total: number;
    uniqueMembers: number;
    byBranch: { id: string; name: string; status: string; count: number }[];
  };
  collected: {
    amount: number;
    count: number;
    cash: number;
    card: number;
  };
  due: {
    amount: number;
    count: number;
  };
};
