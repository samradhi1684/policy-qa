"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Onboarding has been removed from the flow.
// This page now simply redirects to /chat for any bookmarks or old links.
export default function OnboardingPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/chat"); }, [router]);
  return null;
}
