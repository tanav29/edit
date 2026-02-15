"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, Tool, ToolUIPart } from "ai";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { Input } from "@/components/ui/input";
import { Brain, Bug, Check, CircleX, File, Link, Loader, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Page() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <div className="p-8">
      <div className="relative">
        <Input
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
          }}
          className="w-full"
          onKeyDown={async (event) => {
            if (event.key === "Enter") {
              sendMessage({
                parts: [{ type: "text", text: input }],
              });
            }
          }}
        />
        {status == "streaming" ||
          (status == "submitted" && (
            <Loader className="absolute right-2 top-1/2 -translate-y-1/2 w-5 opacity-70 animate-spin" />
          ))}
      </div>

      {messages.map((message, index) => (
        <div
          key={index}
          className={`${message.role == "user" && "justify-end"
            } flex flex-col w-full mt-3 border`}>
          {message.parts.map((part, partIndex) => {
            const key =
              "toolCallId" in part && part.toolCallId
                ? part.toolCallId
                : partIndex;
            switch (part.type) {
              case "text":
                return (
                  <Streamdown
                    key={key}
                    plugins={{ code, mermaid, math, cjk }}
                    isAnimating={part.state == "streaming"}>
                    {part.text}
                  </Streamdown>
                );
              case "reasoning":
                return (
                  <div key={key} className="flex gap-1">
                    {
                      part.state == "streaming" ? <Loader2 className="animate-spin w-4" /> : <Brain className="w-4" />
                    }
                    Thinking
                  </div>
                );
              case "source-document":
                return (
                  <div key={key} className="flex gap-1">
                    <File className="w-4" />
                    {part.filename}
                  </div>
                )
              case "source-url":
                return (
                  <div key={key} className="flex gap-1">
                    <Link className="w-4" />
                    <a href={part.url}>{part.title}</a>
                  </div>
                )
              case "tool-*":

              default:
                if (part.type.startsWith("tool-")) {
                  part = part as ToolUIPart
                  if (part.state == "approval-requested") {
                    return (
                      <div key={key} className="p-2 border rounded-lg">
                        <p className="font-mono">{part.type}</p>
                        <div className="p-2 bg-accent rounded-lg mb-2">
                          {Object.entries(part.input!).map(([key, value]) => (
                            <div key={key}>
                              <strong>{key}:</strong>{" "}
                              {typeof value === "object"
                                ? JSON.stringify(value, null, 2)
                                : String(value)}
                            </div>
                          ))}
                        </div>
                        <div className="space-x-1">
                          <Button
                            onClick={() => {
                              addToolApprovalResponse({
                                id: part.approval.id,
                                approved: true,
                              });
                            }}>
                            Approve
                          </Button>
                          <Button
                            variant={"outline"}
                            onClick={() => {
                              addToolApprovalResponse({
                                id: part.approval.id,
                                approved: false,
                              });
                            }}>
                            Decline
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="flex gap-1" key={key}>
                      {part.providerExecuted &&
                        <>
                          (
                          !part.approval?.approved && <CircleX className="w-4" />
                          )
                          (
                          part.state == "output-error" && <Bug className="w-4" />
                          )
                          (
                          part.state == "output-available" && <Check />
                          )
                        </>
                      }

                      <Loader2 className="animate-spin w-4" />
                      {part.type}
                    </div>
                  );
                }

                return null;
            }
          })}
        </div>
      ))}
    </div>
  );
}
