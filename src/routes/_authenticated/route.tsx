import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getServerSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await getServerSession();
    if (!session.authed || !session.user) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: () => <Outlet />,
});
