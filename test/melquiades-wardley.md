# Melquíades Architecture - Wardley Map

```mermaid
flowchart TD
    %% Melquíades IDE Architecture

    %% User Needs Layer
    subgraph UserNeeds ["🎯 User Needs (Genesis)"]
        UN1["Build IDE from snippets"]
        UN2["Tinkerable runtime"]
        UN3["AI-assisted generation"]
        UN4["Chain execution"]
        UN5["Character interactions"]
    end

    %% UI Layer
    subgraph UI ["🎨 UI Components (Custom)"]
        UC1["Demo Panel"]
        UC2["Snippet Editor"]
        UC3["AI Sidebar"]
        UC4["Chain Execution UI"]
        UC5["Log Output"]
    end

    %% Application Services
    subgraph Services ["⚙️ Application Services"]
        SM1["Snippet Management"]
        SM2["Tag-based filtering"]
        SM3["Language detection"]
        AG1["Streaming responses"]
        AG2["Prompt-driven generation"]
        AG3["Auto-generation"]
        EE1["Browser-safe sandbox"]
        EE2["System execution"]
        CS1["Melquíades persona"]
        CS2["Character switching"]
    end

    %% Core Services
    subgraph Core ["🔧 Core Services"]
        AL1["HTTP handlers"]
        AL2["REST endpoints"]
        AL3["SSE streaming"]
        DL1["PostgreSQL"]
        DL2["Snippet persistence"]
        DL3["Character storage"]
        AB1["oobabooga integration"]
        AB2["OpenAI API compatibility"]
        AB3["Model management"]
        RT1["Go server"]
        RT2["Frontend JavaScript"]
        RT3["Static file serving"]
    end

    %% Infrastructure
    subgraph Infrastructure ["🏗️ Infrastructure (Product)"]
        INF1["Docker containers"]
        INF2["Local development"]
        INF3["File system storage"]
        INF4["GPU acceleration"]
        INF5["Network communication"]
    end

    %% External Dependencies
    subgraph External ["📦 External Dependencies (Commodity)"]
        ES1["oobabooga text-generation-webui"]
        ES2["LLM models GGUF"]
        ES3["PostgreSQL database"]
        ES4["Go standard library"]
        ES5["lib/pq driver"]
        ES6["jQuery frontend"]
        ES7["Browser APIs"]
    end

    %% Connections
    UserNeeds --> UI
    UI --> Services
    Services --> Core
    Core --> Infrastructure
    Infrastructure --> External

    %% Specific flows
    UN1 --> UC1
    UN2 --> UC2
    UN3 --> UC3
    UN4 --> UC4
    UN5 --> UC5

    UC1 --> SM1
    UC2 --> EE1
    UC3 --> CS1
    UC4 --> AG1
    UC5 --> CS2

    SM1 --> AL1
    EE1 --> AL2
    CS1 --> AB1
    AG1 --> AL3

    AL1 --> DL1
    AL2 --> RT1
    AL3 --> AB2
    DL1 --> INF1
    RT1 --> INF2
    AB2 --> ES1

    %% Styling
    classDef userNeeds fill:#e1f5fe,stroke:#0288d1,color:#01579b,font-weight:bold
    classDef uiComponents fill:#f3e5f5,stroke:#8e24aa,color:#4a148c,font-weight:bold
    classDef services fill:#e8f5e8,stroke:#4caf50,color:#1b5e20,font-weight:bold
    classDef core fill:#e0f2f1,stroke:#00acc1,color:#006064,font-weight:bold
    classDef infrastructure fill:#f5f5f5,stroke:#616161,color:#212121,font-weight:bold
    classDef external fill:#fafafa,stroke:#424242,color:#000000,font-weight:bold

    class UN1,UN2,UN3,UN4,UN5 userNeeds
    class UC1,UC2,UC3,UC4,UC5 uiComponents
    class SM1,SM2,SM3,AG1,AG2,AG3,EE1,EE2,CS1,CS2 services
    class AL1,AL2,AL3,DL1,DL2,DL3,AB1,AB2,AB3,RT1,RT2,RT3 core
    class INF1,INF2,INF3,INF4,INF5 infrastructure
    class ES1,ES2,ES3,ES4,ES5,ES6,ES7 external
```

## Architecture Overview

### **User-Facing Components (Visible)**
- **Demo Panel**: Main IDE interface with three-column layout
- **Snippet Editor**: Multi-language code editing with tabs (Prompt/Snippet/Run)
- **Chain Execution**: Orchestrate multiple snippets together
- **AI Sidebar**: Character-based AI interactions and suggestions
- **Log Output**: Real-time execution feedback

### **Core Application Services**
- **Snippet Management**: Create, save, load, filter snippets by tags/language
- **AI Generation**: Streaming responses, prompt-driven generation, auto-generation
- **Execution Engine**: Browser-safe iframe sandbox + system execution
- **Character System**: Melquíades persona with context-aware responses

### **Technical Stack**
- **Frontend**: Vanilla JavaScript + jQuery, no build step
- **Backend**: Go with PostgreSQL
- **AI**: oobabooga text-generation-webui integration
- **Infrastructure**: Docker containers, local development

### **Key Features**
- **Tinkerable Runtime**: Edit and execute snippets at runtime
- **Character-Driven AI**: Melquíades persona for consistent responses
- **Chain Orchestration**: Auto-generate missing snippets in chains
- **Multi-Language Support**: HTML, CSS, JS, Python, Go, SQL, Bash, etc.
- **Sandboxed Execution**: Safe browser execution for web technologies

### **Evolution Strategy**
- **Genesis**: AI generation and character systems (innovative, evolving)
- **Custom Built**: UI, snippet management, execution (unique value)
- **Product**: Database layer (PostgreSQL - mature solution)
- **Commodity**: External services and libraries (standardized)
