import { UserProfile, MeetingEvent, getDialogueAnalysis } from "@oiu/shared";

export interface SuggestedResponse {
  label: "Direct" | "Professional" | "Clarification";
  text: string;
  source?: "gemini" | "wikipedia" | "dictionary" | "fallback";
}

/**
 * Cleans messy Google Meet run-on transcripts and extracts the core question or clean callout,
 * correctly distinguishing old completed sentences from new live utterances and connected follow-ups.
 */
export function extractCoreCalloutOrQuestion(rawText: string, profile: UserProfile): {
  coreText: string;
  isQuestion: boolean;
  topic?: string;
  activeFollowUp?: string;
  relationToPrevious?: string;
  relationReason?: string;
  addressedToOther?: boolean;
  otherTarget?: string;
} {
  const analysis = getDialogueAnalysis(rawText, profile);
  return {
    coreText: analysis.coreFocusText,
    isQuestion: analysis.isQuestion,
    topic: analysis.topic,
    activeFollowUp: analysis.activeFollowUp,
    relationToPrevious: analysis.relationToPrevious,
    relationReason: analysis.relationReason,
    addressedToOther: analysis.addressedToOther,
    otherTarget: analysis.otherTarget,
  };
}

/**
 * Curated knowledge base providing crisp, accurate, 0-millisecond scientific,
 * technical, and academic definitions for common questions asked in classes, viva, and meetings.
 */
const KNOWLEDGE_DICTIONARY: Record<string, { direct: string; professional: string; clarification: string }> = {
  // Chemistry & Atomic Physics
  atom: {
    direct: "An atom is the basic building block of all matter, consisting of a central nucleus of protons and neutrons surrounded by a cloud of orbiting electrons.",
    professional: "Atoms are the fundamental units of a chemical element that retain its chemical properties, with behavior determined by the valence electron configuration in its electron shells.",
    clarification: "Would you like to review atomic models (Bohr vs quantum mechanical) or subatomic particles?",
  },
  molecule: {
    direct: "A molecule is a chemically bonded group of two or more atoms that forms the smallest fundamental unit of a chemical compound.",
    professional: "Molecules represent electrically neutral assemblies held together by covalent or ionic bonds, possessing distinct chemical and physical properties.",
    clarification: "Are we discussing molecular geometry, covalent bonding, or intermolecular interactions?",
  },
  electron: {
    direct: "An electron is a negatively charged subatomic particle that orbits the atomic nucleus and governs electricity and chemical bonding.",
    professional: "Electrons are fundamental fermions with an elementary charge of -1e and spin-1/2, occupying discrete quantum energy levels and atomic orbitals.",
    clarification: "Would you like to focus on valence electron configurations or electrical conductivity?",
  },
  proton: {
    direct: "A proton is a positively charged subatomic particle in the atomic nucleus that defines the atomic number of an element.",
    professional: "Protons are composite baryons containing two up quarks and one down quark, held together by gluons via the strong nuclear force.",
    clarification: "Are we looking at atomic number determination or proton-neutron stability in the nucleus?",
  },
  neutron: {
    direct: "A neutron is a subatomic particle located in the atomic nucleus that has zero electric charge and contributes to atomic mass.",
    professional: "Composed of one up and two down quarks, neutrons provide strong nuclear attractive forces that overcome electrostatic proton-proton repulsion to stabilize the nucleus.",
    clarification: "Would you like to review radioactive isotopes or nuclear fission mechanisms?",
  },
  nucleus: {
    direct: "The atomic nucleus is the dense, positively charged region at the center of an atom made up of protons and neutrons.",
    professional: "Accounting for over 99.9% of an atom's mass, the nucleus is bound by the strong interaction and determines isotopic stability and radioactive decay.",
    clarification: "Are we discussing nuclear binding energy or alpha and beta radioactive decay?",
  },
  "chemical bond": {
    direct: "A chemical bond is an attraction between atoms or ions that enables the formation of chemical compounds.",
    professional: "Chemical bonding arises from electrostatic forces between opposite charges (ionic) or the sharing of electrons between atomic orbitals (covalent).",
    clarification: "Are we focusing on covalent, ionic, metallic, or hydrogen bonding?",
  },
  "covalent bond": {
    direct: "A covalent bond is a chemical bond formed when two atoms share one or more pairs of valence electrons.",
    professional: "Covalent bonds result from orbital overlap between non-metal atoms with similar electronegativities, forming sigma and pi molecular bonds.",
    clarification: "Should we examine single, double, or coordinate covalent bonds?",
  },
  "ionic bond": {
    direct: "An ionic bond is a chemical link between two oppositely charged ions formed by the complete transfer of valence electrons.",
    professional: "Typically occurring between metals and nonmetals with large electronegativity differences, ionic bonding produces crystalline lattice structures with high melting points.",
    clarification: "Would you like to discuss lattice enthalpy or dissociation in aqueous solution?",
  },
  acid: {
    direct: "An acid is a substance that donates hydrogen ions (H+ or protons) or accepts an electron pair, with a pH below 7.",
    professional: "Under Arrhenius, Brønsted-Lowry, and Lewis definitions, acids increase hydronium ion concentration, reacting with bases to form salts and water.",
    clarification: "Are we discussing strong vs weak acids or pH and pKa calculations?",
  },
  base: {
    direct: "A base is a substance that accepts hydrogen ions (protons) or releases hydroxide ions (OH-) in water, having a pH greater than 7.",
    professional: "Bases act as proton acceptors (Brønsted-Lowry) or electron pair donors (Lewis), neutralizing acids through neutralization reactions.",
    clarification: "Should we review the pH scale, alkaline solutions, or conjugate acid-base pairs?",
  },
  "periodic table": {
    direct: "The periodic table is a tabular arrangement of chemical elements organized by increasing atomic number, electron configuration, and recurring chemical properties.",
    professional: "Structured into 7 periods and 18 groups, the periodic table organizes elements into blocks (s, p, d, f) reflecting trends in atomic radius, ionization energy, and electronegativity.",
    clarification: "Would you like to review periodic trends or specific elemental groups like halogens or transition metals?",
  },

  // Computer Science & Data
  data: {
    direct: "Data consists of raw, unorganized facts, figures, symbols, or observations that can be processed and analyzed into meaningful information.",
    professional: "In computing and statistics, data is the digitized representation of qualitative or quantitative variables, structured for storage, processing, and analytical inference.",
    clarification: "Are we discussing structured relational databases or unstructured data processing pipelines?",
  },
  information: {
    direct: "Information is processed, structured, and contextualized data that provides meaning and supports decision-making.",
    professional: "Information represents the reduction of uncertainty through contextualized data, serving as the foundation for knowledge and computational intelligence.",
    clarification: "Should we examine the DIKW hierarchy (Data, Information, Knowledge, Wisdom) or Shannon information entropy?",
  },
  communication: {
    direct: "Communication is the process of transmitting and exchanging information, ideas, messages, and signals between individuals, devices, or systems.",
    professional: "It encompasses sender encoding, transmission channel, noise interference, receiver decoding, and feedback protocols across digital and human networks.",
    clarification: "Are you referring to interpersonal communication models or data network transmission protocols?",
  },
  algorithm: {
    direct: "An algorithm is a finite, step-by-step sequence of well-defined instructions for solving a specific problem or performing a computation.",
    professional: "Algorithms are deterministic computational procedures evaluated by time and space asymptotic complexity (Big-O notation) and correctness invariants.",
    clarification: "Would you like to analyze time complexity, sorting algorithms, or dynamic programming approaches?",
  },
  "data structure": {
    direct: "A data structure is a specialized format for organizing, storing, and managing data in a computer for efficient access and modification.",
    professional: "Data structures define memory organization and abstract data type operations, balancing algorithmic tradeoffs like lookup, insertion, and deletion efficiency.",
    clarification: "Are we reviewing linear structures (arrays, linked lists) or non-linear structures (trees, graphs)?",
  },
  array: {
    direct: "An array is a linear data structure that stores elements of the same data type in contiguous memory locations accessed by an index.",
    professional: "Arrays provide O(1) constant time random access by index, but require O(n) linear time for insertions and deletions due to element shifting.",
    clarification: "Would you like to review static contiguous arrays or dynamic arrays like vectors and ArrayLists?",
  },
  "linked list": {
    direct: "A linked list is a linear data structure where elements (nodes) containing data and pointers are linked sequentially rather than in contiguous memory.",
    professional: "Linked lists allow O(1) insertions and deletions at known pointer positions without memory reallocation, at the cost of O(n) sequential access time.",
    clarification: "Are we examining singly, doubly, or circular linked lists?",
  },
  stack: {
    direct: "A stack is a Last-In, First-Out (LIFO) data structure where elements are added and removed only from the top using push and pop operations.",
    professional: "Stacks operate in O(1) time for push and pop, commonly utilized in call-stack execution, recursion unwinding, syntax parsing, and backtrack algorithms.",
    clarification: "Would you like to look at stack memory allocation or arithmetic expression evaluation?",
  },
  queue: {
    direct: "A queue is a First-In, First-Out (FIFO) data structure where elements are inserted at the rear (enqueue) and removed from the front (dequeue).",
    professional: "Queues provide deterministic O(1) order preservation, essential for asynchronous job scheduling, buffer management, and breadth-first search (BFS).",
    clarification: "Are we reviewing priority queues, circular queues, or double-ended queues (deque)?",
  },
  tree: {
    direct: "A tree is a non-linear hierarchical data structure consisting of nodes connected by edges, starting from a root node down to leaf nodes.",
    professional: "Trees represent acyclic connected graphs where each child has exactly one parent, providing logarithmic search efficiency in balanced binary search trees (BST).",
    clarification: "Would you like to focus on Binary Search Trees (BST), AVL trees, or B-trees in database indexing?",
  },
  graph: {
    direct: "A graph is a non-linear data structure consisting of a finite set of vertices (nodes) and edges connecting pairs of vertices.",
    professional: "Graphs model relational networks (directed/undirected, weighted/unweighted) traversed via algorithms like BFS, DFS, Dijkstra, and topological sort.",
    clarification: "Are we examining shortest path algorithms (Dijkstra/A*) or minimum spanning trees (Kruskal/Prim)?",
  },
  database: {
    direct: "A database is an organized collection of structured information or data stored electronically in a computer system for fast querying and retrieval.",
    professional: "Databases utilize DBMS engines enforcing ACID compliance for relational systems (SQL) or prioritizing distributed horizontal scalability in NoSQL paradigms.",
    clarification: "Are we looking at relational schema normalization, indexing strategies, or distributed NoSQL models?",
  },
  sql: {
    direct: "SQL (Structured Query Language) is the standard programming language used to manage, query, and manipulate relational databases.",
    professional: "SQL provides declarative syntax for Data Definition (DDL), Data Manipulation (DML), and Transaction Control (TCL), supporting complex relational joins and aggregations.",
    clarification: "Would you like to discuss complex joins, indexing optimization, or transaction isolation levels?",
  },
  api: {
    direct: "An API (Application Programming Interface) is a set of rules and protocols that allows different software applications to communicate and exchange data.",
    professional: "APIs define contracts for client-server communication using architectural styles like REST, GraphQL, or gRPC over HTTP/HTTPS with standardized serialization.",
    clarification: "Would you like to focus on RESTful endpoint design, authentication methods (OAuth/JWT), or rate-limiting?",
  },
  "operating system": {
    direct: "An operating system (OS) is system software that manages computer hardware, memory, storage, and provides common services for software applications.",
    professional: "The OS kernel arbitrates CPU process scheduling, memory allocation, virtual memory paging, file system operations, and device I/O concurrency.",
    clarification: "Are we discussing CPU scheduling algorithms, deadlock handling, or virtual memory paging?",
  },
  process: {
    direct: "A process is an active instance of a computer program in execution, containing its own memory space, code, and resources.",
    professional: "Processes possess dedicated virtual address spaces (text, data, heap, stack) and are scheduled by the OS kernel with distinct Process Control Blocks (PCB).",
    clarification: "Would you like to review process lifecycle states or inter-process communication (IPC)?",
  },
  thread: {
    direct: "A thread is the smallest unit of CPU execution within a process, sharing the process's memory and resources while executing independently.",
    professional: "Threads share address space, file descriptors, and global heap while maintaining private program counters and stack frames, enabling lightweight concurrent execution.",
    clarification: "Are we examining multithreading concurrency, race conditions, or mutex synchronization?",
  },
  deadlock: {
    direct: "A deadlock is a situation in computing where two or more processes are permanently blocked because each is holding a resource that the other process needs.",
    professional: "Deadlocks require four simultaneous Coffman conditions: mutual exclusion, hold and wait, no preemption, and circular wait, resolved via prevention, avoidance, or detection.",
    clarification: "Would you like to discuss Dijkstra's Banker's algorithm or resource allocation graph cycles?",
  },
  network: {
    direct: "A computer network is a collection of connected computing devices that communicate and share resources using digital transmission protocols.",
    professional: "Networks operate across the 7-layer OSI model, routing packetized data via TCP/IP protocols over physical and wireless transmission media.",
    clarification: "Should we review the OSI model layers, packet routing, or TCP vs UDP transmission differences?",
  },
  "ip address": {
    direct: "An IP address is a unique numerical label assigned to every device connected to a computer network that uses the Internet Protocol for communication.",
    professional: "IP addresses identify host interfaces and location in network topology, divided into IPv4 (32-bit dotted-decimal) and IPv6 (128-bit hexadecimal) addressing schemes.",
    clarification: "Are we discussing CIDR subnetting, private vs public addresses, or IPv4 to IPv6 migration?",
  },
  "machine learning": {
    direct: "Machine learning is a branch of artificial intelligence that trains computer systems to learn patterns from data and make predictions without explicit programming.",
    professional: "ML algorithms optimize objective cost functions across training datasets, encompassing supervised learning, unsupervised clustering, and reinforcement learning.",
    clarification: "Would you like to focus on supervised regression/classification, neural networks, or evaluation metrics?",
  },
  "artificial intelligence": {
    direct: "Artificial Intelligence (AI) is the simulation of human intelligence processes by computer systems, including learning, reasoning, and self-correction.",
    professional: "AI spans narrow perception and decision systems (deep learning, computer vision, NLP) through generative architectures and autonomous agentic workflows.",
    clarification: "Are we discussing generative large language models, expert systems, or computer vision?",
  },
  cloud: {
    direct: "Cloud computing is the on-demand delivery of computing services—including servers, storage, databases, networking, and software—over the internet.",
    professional: "It provides elastic, pay-as-you-go infrastructure across IaaS, PaaS, and SaaS models with automated provisioning and distributed high availability.",
    clarification: "Are we evaluating cloud service models (IaaS/PaaS/SaaS) or container orchestration with Kubernetes?",
  },

  // Physics & Mechanics
  gravity: {
    direct: "Gravity is a fundamental natural force of attraction between all objects with mass or energy.",
    professional: "In classical mechanics, gravity is governed by Newton's universal inverse-square law; in Einstein's general relativity, it is the curvature of spacetime caused by mass-energy.",
    clarification: "Would you like to review Newtonian gravitational acceleration (g = 9.8 m/s²) or relativistic spacetime curvature?",
  },
  force: {
    direct: "A force is an interaction that causes an object to change its velocity, direction, or shape (defined by Newton's second law: F = ma).",
    professional: "Force is a vector quantity defined as the rate of change of momentum (dp/dt), categorized into the four fundamental interactions: gravitational, electromagnetic, strong, and weak.",
    clarification: "Are we reviewing Newton's second law (F=ma) or free-body diagram equilibrium?",
  },
  energy: {
    direct: "Energy is the quantitative property transferred to an object to perform work or produce heat, and it cannot be created or destroyed.",
    professional: "Governed by the law of conservation of energy, it transforms between kinetic, potential, thermal, chemical, and electromagnetic forms according to thermodynamic principles.",
    clarification: "Are we examining kinetic vs potential energy or thermodynamic work transfer?",
  },
  friction: {
    direct: "Friction is the resistive force that opposes the relative motion or tendency of motion between two surfaces in contact.",
    professional: "Friction is proportional to normal force (F = μN) and arises from microscopic surface asperities and molecular adhesion, classified into static, kinetic, and rolling friction.",
    clarification: "Would you like to calculate static vs kinetic friction coefficients?",
  },

  // Biology & Life Sciences
  photosynthesis: {
    direct: "Photosynthesis is the biological process by which green plants and algae use sunlight, water, and carbon dioxide to produce oxygen and glucose.",
    professional: "It comprises light-dependent reactions in thylakoid membranes generating ATP and NADPH, followed by the Calvin cycle in the stroma synthesizing carbohydrates.",
    clarification: "Would you like to discuss the light-dependent reactions or the dark Calvin cycle reactions?",
  },
  mitochondria: {
    direct: "Mitochondria are the powerhouses of the cell, generating most of the chemical energy (ATP) needed for cellular functions.",
    professional: "These double-membrane organelles produce adenosine triphosphate through cellular respiration, the Krebs cycle, and oxidative phosphorylation along the electron transport chain.",
    clarification: "Are we reviewing ATP synthase mechanics or the mitochondrial matrix structure?",
  },
  cell: {
    direct: "A cell is the smallest structural and functional unit of all living organisms, capable of independent reproduction and metabolism.",
    professional: "Cells are bounded by a phospholipid bilayer membrane and classified into prokaryotic (lacking membrane-bound nucleus) and eukaryotic (with organelle compartmentalization).",
    clarification: "Would you like to compare plant vs animal cells or prokaryotic vs eukaryotic structures?",
  },
  dna: {
    direct: "DNA (deoxyribonucleic acid) is the hereditary molecule carrying genetic instructions for the development, functioning, and reproduction of all organisms.",
    professional: "Structured as an antiparallel double helix of nucleotide base pairs (adenine-thymine, guanine-cytosine), DNA guides RNA transcription and protein synthesis.",
    clarification: "Would you like to cover DNA replication enzymes or transcription into mRNA?",
  },
  rna: {
    direct: "RNA (ribonucleic acid) is a single-stranded nucleic acid molecule that translates genetic information from DNA into functional proteins.",
    professional: "Composed of ribose sugar and nitrogenous bases (adenine, uracil, guanine, cytosine), RNA functions as mRNA (messenger), tRNA (transfer), and rRNA (ribosomal) in protein translation.",
    clarification: "Are we examining transcription, mRNA processing, or tRNA translation?",
  },

  // Geography & General Knowledge
  "capital of india": {
    direct: "New Delhi is the capital of India.",
    professional: "New Delhi serves as the national capital of India and the seat of all three branches of the Government of India: the executive, legislative, and judiciary.",
    clarification: "Would you like historical details or administrative structure regarding New Delhi?",
  },
  "capital of the united states": {
    direct: "Washington, D.C. is the capital of the United States.",
    professional: "Washington, D.C. (District of Columbia) is a federal district that houses the Capitol, the White House, and the Supreme Court of the United States.",
    clarification: "Should we discuss its status as a federal district or governance structure?",
  },
  "capital of france": {
    direct: "Paris is the capital of France.",
    professional: "Paris is the capital and most populous city of France, serving as its national administrative, cultural, and economic center.",
    clarification: "Would you like to discuss its governance or historical background?",
  },
  "capital of japan": {
    direct: "Tokyo is the capital of Japan.",
    professional: "Tokyo is the capital and administrative center of Japan, being the seat of the Japanese Emperor and the national government.",
    clarification: "Would you like details on Tokyo's metropolitan administration or economic profile?",
  },
};

/**
 * Cleanly extracts the primary keyword or topic from a spoken question,
 * stripping participant names, roll numbers, speech-to-text artifacts, and filler words.
 */
function cleanTopicKey(text: string, profile?: UserProfile): string {
  let cleaned = text.toLowerCase();

  // Strip user profile names and identifiers if present
  if (profile) {
    if (profile.displayName) {
      cleaned = cleaned.replace(new RegExp(`\\b${profile.displayName.toLowerCase()}\\b`, "g"), " ");
    }
    for (const alias of profile.aliases || []) {
      if (alias.trim()) {
        cleaned = cleaned.replace(new RegExp(`\\b${alias.toLowerCase().trim()}\\b`, "g"), " ");
      }
    }
    for (const id of profile.identifiers || []) {
      if (id.trim()) {
        cleaned = cleaned.replace(new RegExp(`\\b${id.toLowerCase().trim()}\\b`, "g"), " ");
      }
    }
  }

  // Strip other common participant names or words from meeting captions
  cleaned = cleaned.replace(/\b(ryan|aryan|tathagat|tatha|swagat|shivam|rahul|priya|ankit)\b/gi, " ");

  // Normalize speech-to-text errors (e.g. "capital off india" -> "capital of india")
  cleaned = cleaned.replace(/\bcapital\s+off\s+/gi, "capital of ");
  cleaned = cleaned.replace(/\bmeaning\s+off\s+/gi, "meaning of ");
  cleaned = cleaned.replace(/\bdefination\b/gi, "definition");
  cleaned = cleaned.replace(/\br\s+u\b/gi, "are you");

  // Remove question starters and conversational filler
  cleaned = cleaned
    .replace(/[?!.,;:()"]/g, " ")
    .replace(/\b(what is|what are|what was|what were|define|explain|who is|who was|kya hai|kya hota hai|batao|can you tell me|can you explain|tell me about|tell me|meaning of|definition of|please|hello|hi|hey|listening|attendance)\b/gi, " ")
    .replace(/\b(a|an|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

/**
 * Fetches accurate Wikipedia encyclopedia knowledge in real-time.
 * 100% free, 0 API key required, fast (~100ms), covers virtually any academic,
 * scientific, historical, or technical subject in human knowledge.
 */
async function fetchWikipediaSummary(query: string, profile?: UserProfile): Promise<SuggestedResponse[] | null> {
  try {
    const clean = cleanTopicKey(query, profile);
    if (!clean || clean.length < 2) return null;

    // Helper to fetch direct summary by title
    const fetchSummaryForTitle = async (title: string): Promise<string | null> => {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        return data.extract && data.extract.length > 20 ? data.extract : null;
      } catch {
        clearTimeout(timeout);
        return null;
      }
    };

    // 1. Try direct summary with cleaned query
    let extract = await fetchSummaryForTitle(clean);
    let resolvedTitle = clean;

    // 2. If direct title didn't resolve (or 404), use Wikipedia OpenSearch to find canonical title
    if (!extract) {
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(clean)}&limit=1&namespace=0&format=json&origin=*`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const searchRes = await fetch(searchUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData && Array.isArray(searchData[1]) && searchData[1].length > 0) {
            resolvedTitle = searchData[1][0];
            extract = await fetchSummaryForTitle(resolvedTitle);
          }
        }
      } catch {}
    }

    if (!extract) return null;

    // Extract first 1-2 crisp sentences for the Direct answer
    const sentences = extract.split(/(?<=[.?!])\s+/);
    const directText = sentences.slice(0, 2).join(" ").trim();
    const profText = extract.length > 340 ? `${extract.slice(0, 335).trim()}...` : extract;
    const displayTopic = resolvedTitle.charAt(0).toUpperCase() + resolvedTitle.slice(1);

    return [
      {
        label: "Direct",
        text: directText,
        source: "wikipedia",
      },
      {
        label: "Professional",
        text: profText,
        source: "wikipedia",
      },
      {
        label: "Clarification",
        text: `Would you like me to elaborate on the core principles or practical details of ${displayTopic}?`,
        source: "wikipedia",
      },
    ];
  } catch {
    return null;
  }
}

/**
 * Returns instant, 0-millisecond intelligent grounded responses for meetings and questions.
 * Deeply covers academic, technical, scientific, and corporate questions without generic filler.
 */
export function getInstantSmartResponses(
  event: MeetingEvent,
  profile: UserProfile
): SuggestedResponse[] {
  const { coreText, isQuestion, topic } = extractCoreCalloutOrQuestion(event.transcriptExcerpt, profile);
  const idStr = profile.identifiers[0] || "";

  const rawTopic = topic || coreText;
  const cleanKey = cleanTopicKey(rawTopic, profile);

  // 1. Check curated knowledge dictionary for accurate factual definition
  if (cleanKey) {
    // Sort keys by length descending so longer, more specific multi-word phrases match first
    const sortedKeys = Object.keys(KNOWLEDGE_DICTIONARY).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (cleanKey === key) {
        const val = KNOWLEDGE_DICTIONARY[key];
        return [
          { label: "Direct", text: val.direct, source: "dictionary" },
          { label: "Professional", text: val.professional, source: "dictionary" },
          { label: "Clarification", text: val.clarification, source: "dictionary" },
        ];
      }
      // Whole-word boundary match (never match substrings inside other words like 'api' inside 'capital')
      const wordBoundaryRegex = new RegExp(`(^|\\s)${key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`, "i");
      if (wordBoundaryRegex.test(cleanKey)) {
        const val = KNOWLEDGE_DICTIONARY[key];
        return [
          { label: "Direct", text: val.direct, source: "dictionary" },
          { label: "Professional", text: val.professional, source: "dictionary" },
          { label: "Clarification", text: val.clarification, source: "dictionary" },
        ];
      }
    }
  }

  // 2. Attendance & ID Roll Call
  if (event.type === "ATTENDANCE_CALL") {
    return [
      { label: "Direct", text: idStr ? `Present, ${idStr} here.` : "Present.", source: "fallback" },
      { label: "Professional", text: idStr ? `Present, roll number ${idStr}. Thank you.` : "Present, thank you.", source: "fallback" },
      { label: "Clarification", text: "Present, can you hear me clearly?", source: "fallback" },
    ];
  }

  // 3. Monitored Keyword Mention
  if (event.type === "KEYWORD_MENTION") {
    const kwMatch = event.explanation?.match(/"([^"]+)"/);
    const kw = kwMatch ? kwMatch[1] : (topic || coreText);
    const lowerKw = kw.toLowerCase();

    if (lowerKw.includes("attendance") || lowerKw.includes("present") || lowerKw.includes("roll")) {
      return [
        { label: "Direct", text: idStr ? `Present, ${idStr} here.` : "Present.", source: "fallback" },
        { label: "Professional", text: idStr ? `Present, roll number ${idStr}. Thank you.` : "Present, thank you.", source: "fallback" },
        { label: "Clarification", text: "Present, has the attendance form or link been shared?", source: "fallback" },
      ];
    }

    return [
      { label: "Direct", text: `Yes, I am following the discussion on ${kw}.`, source: "fallback" },
      { label: "Professional", text: `Regarding ${kw}, I can contribute details whenever needed.`, source: "fallback" },
      { label: "Clarification", text: `Could you clarify the next step concerning ${kw}?`, source: "fallback" },
    ];
  }

  // 4. Natural Spoken Meeting Response for Any General Question (NO robotic filler)
  if (isQuestion || event.type === "DIRECT_QUESTION") {
    const capTopic = cleanKey ? cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1) : "that";
    return [
      {
        label: "Direct",
        text: `Yes, I am following along regarding ${capTopic}. Could you please specify which aspect or practical use case you'd like me to address?`,
        source: "fallback",
      },
      {
        label: "Professional",
        text: `Regarding ${capTopic}, I would be glad to share my perspective. To ensure I cover the most relevant points, could you clarify the specific focus?`,
        source: "fallback",
      },
      {
        label: "Clarification",
        text: `Would you like me to walk through the fundamental concept of ${capTopic}, or discuss its specific application in this scenario?`,
        source: "fallback",
      },
    ];
  }

  // 5. Name Mention fallback
  return [
    { label: "Direct", text: idStr ? `Yes, ${idStr} here.` : "Yes, I'm here.", source: "fallback" },
    { label: "Professional", text: "Hi! Yes, I was following along. How can I help?", source: "fallback" },
    { label: "Clarification", text: "Yes, could you please recap the last question?", source: "fallback" },
  ];
}

/**
 * Generates intelligent meeting responses using:
 * 1. Google Gemini Flash (if API key is present)
 * 2. Real-time Wikipedia encyclopedia knowledge (free, fast, universal for all human knowledge)
 * 3. Curated STEM & business dictionary
 */
export async function generateSmartResponses(
  event: MeetingEvent,
  profile: UserProfile,
  apiKey?: string,
  recentContext = ""
): Promise<SuggestedResponse[]> {
  const { coreText, isQuestion, topic } = extractCoreCalloutOrQuestion(event.transcriptExcerpt, profile);
  const idStr = profile.identifiers[0] || "";

  // 1. Try Google Gemini Flash API if user entered a key
  if (apiKey && apiKey.trim().length > 10) {
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash-latest",
    ];

    const prompt = `You are an intelligent real-time meeting copilot assisting ${profile.displayName || "Aryan"} (ID/Roll: "${idStr}").
The meeting speaker just directly asked or said to you:
"${coreText || event.transcriptExcerpt}"

Recent conversation context from the meeting:
"${recentContext.slice(-450)}"

Generate 3 natural, spoken-ready responses that ${profile.displayName || "Aryan"} can immediately read aloud to answer the speaker in the meeting:
1. "direct": A clear, accurate, 1-2 sentence answer directly answering the question (whether technical, factual, viva concept, project update, or opinion). Answer accurately with zero generic filler.
2. "professional": A polite, articulate, and well-reasoned response with appropriate depth.
3. "clarification": A natural follow-up or clarifying question to keep the conversation flowing.

Respond strictly with valid JSON:
{"direct": "...", "professional": "...", "clarification": "..."}`;

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (jsonText) {
            jsonText = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
            const parsed = JSON.parse(jsonText);
            if (parsed.direct && parsed.professional && parsed.clarification) {
              return [
                { label: "Direct", text: parsed.direct, source: "gemini" },
                { label: "Professional", text: parsed.professional, source: "gemini" },
                { label: "Clarification", text: parsed.clarification, source: "gemini" },
              ];
            }
          }
        } else {
          const errBody = await res.text().catch(() => "");
          console.warn(`[OiU Gemini API Note] Status ${res.status}:`, errBody.slice(0, 200));
        }
      } catch (err) {
        console.warn(`[OiU AI] Attempt with ${model} note:`, err);
      }
    }
  }

  // 2. Query universal Wikipedia encyclopedia knowledge (covers ANY question in human history)
  if (isQuestion || event.type === "DIRECT_QUESTION") {
    const targetQuery = topic || coreText;
    const wikiResponses = await fetchWikipediaSummary(targetQuery, profile);
    if (wikiResponses && wikiResponses.length >= 3) {
      return wikiResponses;
    }
  }

  // 3. Fallback to instant curated knowledge dictionary & clean spoken responses
  return getInstantSmartResponses(event, profile);
}

/**
 * Tests connection to Google Gemini API with the user's key.
 */
export async function testGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  if (!apiKey || apiKey.trim().length < 8) {
    return { success: false, message: "Please enter a valid Gemini API key first." };
  }
  const cleanKey = apiKey.trim();
  const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest"];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello, reply with 'OK'" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      if (res.ok) {
        return { success: true, message: `Connected to Google ${model} successfully!` };
      }
      const err = await res.json().catch(() => null);
      if (err?.error?.message) {
        return { success: false, message: `API Error: ${err.error.message}` };
      }
    } catch (e: any) {
      return { success: false, message: e?.message || "Connection network error" };
    }
  }
  return { success: false, message: "Could not reach Gemini models. Please check your key or internet connection." };
}
