const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || DEFAULT_ORIGINS.join(",");

const allowedOrigins = CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Simple CORS setup for development
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true,
  optionsSuccessStatus: 204,
}));
app.use(express.json());

app.use((err, _req, res, next) => {
  if (err && err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: err.message });
  }
  return next(err);
});

function requireApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Please provide a valid OpenAI API key."
    );
  }
}

requireApiKey();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const conversationState = {
  nodes: {},
  rootIds: [],
};

function createNode({ role, content, parentId = null }) {
  const id = crypto.randomUUID();
  let rootId = id;

  if (parentId) {
    const parent = conversationState.nodes[parentId];
    if (parent) {
      rootId = parent.rootId || parent.id;
    }
  }

  const node = {
    id,
    role,
    content,
    parentId,
    children: [],
    createdAt: new Date().toISOString(),
    rootId,
  };
  conversationState.nodes[id] = node;
  if (parentId) {
    const parent = conversationState.nodes[parentId];
    if (parent) {
      parent.children.push(id);
    }
  } else {
    conversationState.rootIds.push(id);
  }
  return node;
}

function getNodePath(nodeId) {
  const path = [];
  let currentId = nodeId;
  while (currentId) {
    const node = conversationState.nodes[currentId];
    if (!node) {
      break;
    }
    path.push(node);
    currentId = node.parentId;
  }
  return path.reverse();
}

function getRootId(nodeId) {
  const node = conversationState.nodes[nodeId];
  if (!node) {
    return nodeId;
  }
  return node.rootId || node.id;
}

function pruneToRoot(rootId) {
  const root = conversationState.nodes[rootId];
  if (!root) {
    return;
  }

  const retainedIds = new Set();
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (retainedIds.has(currentId)) continue;
    const node = conversationState.nodes[currentId];
    if (!node) continue;

    retainedIds.add(currentId);
    (node.children || []).forEach((childId) => {
      if (!retainedIds.has(childId)) {
        queue.push(childId);
      }
    });
  }

  const nextNodes = {};
  retainedIds.forEach((id) => {
    const node = conversationState.nodes[id];
    if (node) {
      nextNodes[id] = {
        ...node,
        children: node.children.filter((childId) => retainedIds.has(childId)),
      };
    }
  });

  conversationState.nodes = nextNodes;
  conversationState.rootIds = [rootId];
}

function deleteSubtree(nodeId) {
  const toDelete = [nodeId];

  while (toDelete.length > 0) {
    const currentId = toDelete.pop();
    const node = conversationState.nodes[currentId];
    if (!node) continue;

    (node.children || []).forEach((childId) => {
      toDelete.push(childId);
    });

    delete conversationState.nodes[currentId];
  }
}

function serializeState() {
  return {
    rootIds: conversationState.rootIds,
    nodes: conversationState.nodes,
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/threads", (_req, res) => {
  res.json(serializeState());
});

app.post("/messages", async (req, res) => {
  try {
    const { content, parentId = null } = req.body || {};
    if (!content || typeof content !== "string") {
      return res
        .status(400)
        .json({ error: "Message content is required and must be a string." });
    }

    if (parentId) {
      const parentNode = conversationState.nodes[parentId];
      if (!parentNode) {
        return res.status(404).json({ error: "Parent message not found." });
      }
      if (parentNode.role !== "assistant") {
        return res
          .status(400)
          .json({ error: "User messages must reply to an assistant message." });
      }
    }

    const userNode = createNode({ role: "user", content, parentId });
    const contextPath = getNodePath(userNode.id);
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant inside a threaded conversation. Respond to the latest user message. Only use the conversation path provided; do not assume context from sibling branches.",
      },
      ...contextPath.map((node) => ({
        role: node.role,
        content: node.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
    });

    const assistantContent =
      completion.choices?.[0]?.message?.content ||
      "I'm sorry, I was unable to generate a response.";

    const assistantNode = createNode({
      role: "assistant",
      content: assistantContent,
      parentId: userNode.id,
    });

    const activeRootId = getRootId(userNode.id);
    pruneToRoot(activeRootId);

    res.json({
      user: userNode,
      assistant: assistantNode,
      state: serializeState(),
    });
  } catch (error) {
    console.error("Error handling message:", error);
    res
      .status(500)
      .json({ error: "Failed to process message.", details: error.message });
  }
});

app.delete("/messages/:id", (req, res) => {
  try {
    const { id } = req.params;
    const targetNode = conversationState.nodes[id];

    if (!targetNode) {
      return res.status(404).json({ error: "Message not found." });
    }

    if (!targetNode.parentId) {
      return res
        .status(400)
        .json({ error: "Root messages cannot be deleted." });
    }

    const parentNode = conversationState.nodes[targetNode.parentId];
    if (parentNode) {
      parentNode.children = parentNode.children.filter(
        (childId) => childId !== id
      );
    }

    const rootId = targetNode.rootId || getRootId(targetNode.parentId);
    deleteSubtree(id);
    pruneToRoot(rootId);

    res.json({ state: serializeState() });
  } catch (error) {
    console.error("Error deleting message:", error);
    res
      .status(500)
      .json({ error: "Failed to delete message.", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


