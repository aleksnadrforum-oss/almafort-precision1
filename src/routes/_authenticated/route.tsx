import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureServerSession } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await ensureServerSession();
    if (!session.authed || !session.user) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: () => <Outlet />,
});
