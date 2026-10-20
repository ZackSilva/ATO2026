"use client";

import Collection from "../../collection";
import { useWorkspace } from "../../workspace-shell";

export default function CollectionPage() {
  const { session, onExpired } = useWorkspace();
  return <Collection session={session} onExpired={onExpired} />;
}
