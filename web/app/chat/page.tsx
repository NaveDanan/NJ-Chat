import dynamic from "next/dynamic";

export const metadata = { title: "Chat • NJ-Chat" };

const ChatLayout = dynamic(() => import("@/components/chat/chat-layout"), { ssr: false });

export default function ChatPage() {
  return <ChatLayout />;
}

