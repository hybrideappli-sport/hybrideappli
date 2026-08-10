import type { Metadata } from "next";

import { CoachChat } from "@/components/onboarding/coach-chat";

export const metadata: Metadata = {
  title: "Onboarding — Ton coach IA",
};

export default function OnboardingChatPage() {
  return <CoachChat />;
}
