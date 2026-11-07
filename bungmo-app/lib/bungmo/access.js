export const BUNGMO_ADMIN_EMAIL = "noamchomsky1571@gmail.com";

export const canManageBungmo = (user) => user?.bungmoOperator === true;
export const hasBungmoAccess = (profile) => profile?.active !== false;
