import { UserProfile, MeetingEvent } from "@oiu/shared";

export interface SuggestedResponse {
  label: "Direct" | "Professional" | "Clarification";
  text: string;
}

/**
 * Cleans messy Google Meet run-on transcripts and extracts the core question or clean callout.
 */
export function extractCoreCalloutOrQuestion(rawText: string, profile: UserProfile): {
  coreText: string;
  isQuestion: boolean;
  topic?: string;
} {
  const text = rawText.trim();
  if (!text) return { coreText: "", isQuestion: false };

  // 1. Check for question marks and question structures
  const sentences = text
    .split(/(?<=[.?!])\s+|(?<=\?)|(?<=\!)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  // Search from the latest sentence backwards for the actual question
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    const isQ = s.includes("?") || /\b(what|why|how|when|where|who|which|can you|could you|would you|do you|are you|tell me|explain|define)\b/i.test(s);
    if (isQ) {
      // Clean leading clutter like "Swagat what is..." or "tathagat what is..."
      let cleaned = s;
      const match = cleaned.match(/\b(what|why|how|when|where|who|which|can you|could you|would you|do you|are you|tell me|explain|define)\b.*/i);
      if (match && match[0]) {
        cleaned = match[0];
      }
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      if (!cleaned.endsWith("?")) cleaned += "?";

      // Extract topic if possible (e.g. "what is mitochondria?" -> "mitochondria")
      const topicMatch = cleaned.match(/(?:what is|what are|define|explain|about)\s+([a-zA-Z0-9\s]+?)(?:\?|$)/i);
      const topic = topicMatch ? topicMatch[1].trim() : undefined;

      return {
        coreText: cleaned,
        isQuestion: true,
        topic,
      };
    }
  }

  // 2. If not a question, look for the clean ID or Name mention phrase
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    const hasId = profile.identifiers.some((id) => id && s.includes(id));
    const hasName = [profile.displayName, ...profile.aliases].some((n) => n && s.toLowerCase().includes(n.toLowerCase()));
    if (hasId || hasName) {
      return {
        coreText: s.charAt(0).toUpperCase() + s.slice(1),
        isQuestion: false,
      };
    }
  }

  // 3. Fallback: clean the last 12 words of the text
  const words = text.split(/\s+/);
  const core = words.slice(-12).join(" ");
  return {
    coreText: core.charAt(0).toUpperCase() + core.slice(1),
    isQuestion: text.includes("?"),
  };
}

/**
 * Returns instant, 0-millisecond intelligent grounded responses for meetings and questions.
 */
export function getInstantSmartResponses(
  event: MeetingEvent,
  profile: UserProfile
): SuggestedResponse[] {
  const { coreText, isQuestion, topic } = extractCoreCalloutOrQuestion(event.transcriptExcerpt, profile);
  const idStr = profile.identifiers[0] || "";

  const lowerTopic = (topic || coreText).toLowerCase();

  // Instant factual answers for common academic, tech, and biology questions
  if (lowerTopic.includes("mitochondria")) {
    return [
      { label: "Direct", text: "Mitochondria are the powerhouses of the cell, generating most of the chemical energy (ATP) needed for cellular functions." },
      { label: "Professional", text: "Mitochondria are membrane-bound organelles that produce ATP through cellular respiration to fuel cellular metabolism." },
      { label: "Clarification", text: "Would you like me to elaborate on the ATP synthesis mechanism or the organelle's double-membrane structure?" },
    ];
  }

  if (lowerTopic.includes("photosynthesis")) {
    return [
      { label: "Direct", text: "Photosynthesis is the process by which green plants use sunlight, water, and CO2 to produce oxygen and glucose." },
      { label: "Professional", text: "It converts light energy into chemical energy, primarily driving primary biomass production and the carbon cycle." },
      { label: "Clarification", text: "Are we discussing the light-dependent reactions or the Calvin cycle?" },
    ];
  }

  if (lowerTopic.includes("dna") || lowerTopic.includes("rna")) {
    return [
      { label: "Direct", text: "DNA carries genetic instructions for development and functioning, while RNA translates that code into proteins." },
      { label: "Professional", text: "DNA serves as the hereditary blueprint, whereas mRNA and tRNA facilitate protein synthesis via transcription and translation." },
      { label: "Clarification", text: "Would you like to focus on replication mechanisms or protein translation?" },
    ];
  }

  if (lowerTopic.includes("nucleus") || lowerTopic.includes("cell")) {
    return [
      { label: "Direct", text: "The nucleus is the control center of the eukaryotic cell, housing the genetic material (DNA) and coordinating growth and reproduction." },
      { label: "Professional", text: "It regulates gene expression and mediates DNA replication and transcription within a specialized double-membrane envelope." },
      { label: "Clarification", text: "Would you like me to focus on the nuclear membrane or chromatin organization?" },
    ];
  }

  if (lowerTopic.includes("osmosis") || lowerTopic.includes("diffusion")) {
    return [
      { label: "Direct", text: "Osmosis is the net movement of water molecules across a semipermeable membrane from an area of higher to lower water potential." },
      { label: "Professional", text: "It is a passive transport mechanism essential for maintaining cellular turgor pressure and fluid homeostasis." },
      { label: "Clarification", text: "Are we discussing hypertonic, hypotonic, or isotonic conditions?" },
    ];
  }

  if (lowerTopic.includes("api") || lowerTopic.includes("rest")) {
    return [
      { label: "Direct", text: "An API (Application Programming Interface) allows different software applications to communicate and exchange data securely." },
      { label: "Professional", text: "RESTful APIs use standardized HTTP verbs (GET, POST, PUT, DELETE) to manage stateless communication between client and server." },
      { label: "Clarification", text: "Would you like me to cover endpoint design or authentication protocols?" },
    ];
  }

  if (lowerTopic.includes("database") || lowerTopic.includes("sql")) {
    return [
      { label: "Direct", text: "Databases organize and store structured data, with SQL used for relational queries and NoSQL for scalable document storage." },
      { label: "Professional", text: "Relational databases enforce ACID compliance for transactional integrity, while distributed databases optimize for high throughput." },
      { label: "Clarification", text: "Are we discussing query optimization, indexing, or schema normalization?" },
    ];
  }

  if (isQuestion || event.type === "DIRECT_QUESTION") {
    if (topic && topic.length > 2) {
      const capTopic = topic.charAt(0).toUpperCase() + topic.slice(1);
      return [
        { label: "Direct", text: `${capTopic} is essentially centered on its functional role and how it interfaces with our core subject.` },
        { label: "Professional", text: `Speaking to ${topic}, the primary factor involves its foundational principles and practical implementation.` },
        { label: "Clarification", text: `Would you like me to elaborate on the conceptual overview or the specific operational details of ${topic}?` },
      ];
    }
    return [
      { label: "Direct", text: "Yes, I'm on it. Looking into that right now." },
      { label: "Professional", text: "Apologies, I was momentarily on mute. Could you repeat that point?" },
      { label: "Clarification", text: "Could you clarify which specific item you'd like me to address?" },
    ];
  }

  if (event.type === "ATTENDANCE_CALL") {
    return [
      { label: "Direct", text: idStr ? `Present, ${idStr} here.` : "Present." },
      { label: "Professional", text: idStr ? `Present, roll number ${idStr}. Thank you.` : "Present, thank you." },
      { label: "Clarification", text: "Present, can you hear me clearly?" },
    ];
  }

  return [
    { label: "Direct", text: "Yes, I'm here." },
    { label: "Professional", text: "Hi! Yes, I was following along. How can I help?" },
    { label: "Clarification", text: "Yes, could you please recap the last point?" },
  ];
}

/**
 * Generates intelligent meeting responses using the free Google Gemini Flash API.
 * Falls back cleanly to grounded template responses if no key is configured or on network error.
 */
export async function generateSmartResponses(
  event: MeetingEvent,
  profile: UserProfile,
  apiKey?: string,
  recentContext = ""
): Promise<SuggestedResponse[]> {
  const { coreText } = extractCoreCalloutOrQuestion(event.transcriptExcerpt, profile);
  const idStr = profile.identifiers[0] || "";

  // If user provided a Gemini API Key, call Gemini 1.5 Flash for real-time AI generation
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const prompt = `You are a discreet, intelligent copilot assisting a participant in an ongoing Google Meet.
The speaker in the meeting just said/asked: "${coreText || event.transcriptExcerpt}"
Context of recent speech: "${recentContext.slice(-300)}"
The user's display name is "${profile.displayName || "Aryan"}" (ID/Roll: "${idStr}").

Generate 3 concise, spoken-ready responses that the user can immediately read aloud:
1. "Direct": A direct, accurate, factual answer to the specific question asked (1-2 sentences max).
2. "Professional": A polite, professional, and knowledgeable answer.
3. "Clarification": A short, smart follow-up or clarifying question.

Respond strictly with valid JSON:
{
  "direct": "...",
  "professional": "...",
  "clarification": "..."
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          if (parsed.direct && parsed.professional && parsed.clarification) {
            return [
              { label: "Direct", text: parsed.direct },
              { label: "Professional", text: parsed.professional },
              { label: "Clarification", text: parsed.clarification },
            ];
          }
        }
      } else {
        console.warn("[OiU AI] Gemini API call status:", res.status);
      }
    } catch (err) {
      console.warn("[OiU AI] Error calling Gemini API:", err);
    }
  }

  // Instant fallback
  return getInstantSmartResponses(event, profile);
}
