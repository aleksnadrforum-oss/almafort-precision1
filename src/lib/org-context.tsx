/**
 * Организационный контекст B2B.
 *
 * В снабжении аккаунт — это компания, а не человек: корзина принадлежит
 * организации (ИНН), а конкретный сотрудник лишь держит блокировку
 * редактирования (`lockedBy`). Это фундамент Shared Cart: коллеги видят
 * одну спецификацию, но не перетирают правки друг друга.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { currentUser, onAuthChange, type SessionUser } from "@/lib/session";
import { useCart } from "@/store/cart-store";

const ORG_KEY = "almafort:org:v1";

export type OrgIdentity = {
  user: SessionUser | null;
  userId: string | null;
  /** ИНН организации — ключ общей корзины компании. */
  organizationId: string | null;
  setOrganizationId: (inn: string | null) => void;
  /** Сотрудник, который сейчас редактирует спецификацию организации. */
  lockedBy: string | null;
  /** true — спецификацию правит другой сотрудник компании. */
  lockedByOther: boolean;
};

const Ctx = createContext<OrgIdentity | null>(null);

function readOrg(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organizationId, setOrg] = useState<string | null>(null);
  const bindOrganization = useCart((s) => s.bindOrganization);
  const lockedBy = useCart((s) => s.lockedBy);

  useEffect(() => {
    setUser(currentUser());
    setOrg(readOrg());
    return onAuthChange(() => {
      setUser(currentUser());
      setOrg(readOrg());
    });
  }, []);

  useEffect(() => {
    bindOrganization(organizationId, user?.id ?? null);
  }, [organizationId, user?.id, bindOrganization]);

  const value = useMemo<OrgIdentity>(
    () => ({
      user,
      userId: user?.id ?? null,
      organizationId,
      setOrganizationId: (inn) => {
        setOrg(inn);
        if (typeof window !== "undefined") {
          if (inn) window.localStorage.setItem(ORG_KEY, inn);
          else window.localStorage.removeItem(ORG_KEY);
        }
      },
      lockedBy,
      lockedByOther: Boolean(lockedBy && user?.id && lockedBy !== user.id),
    }),
    [user, organizationId, lockedBy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgIdentity {
  return (
    useContext(Ctx) ?? {
      user: null,
      userId: null,
      organizationId: null,
      setOrganizationId: () => {},
      lockedBy: null,
      lockedByOther: false,
    }
  );
}
