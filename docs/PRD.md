# ATLAS ONE
## N-ATLAS, one instruction away.

**PRODUCT REQUIREMENTS DOCUMENT (PRD)**

**Product:** Atlas One  
**Version:** 0.1  
**Date:** October 11, 2026  
**Status:** Proposed — not yet implemented  
**Category:** Agent-native developer infrastructure  
**Competition:** National AI Innovation Challenge (NAIC 2026) — PS1 Developer Infrastructure

**Tagline:** N-ATLAS, one instruction away.

**Supporting line:** Connect once. Build through your agent.

**Mission:** Make Nigeria's N-ATLAS models accessible to coding agents so developers can build real applications without manually assembling model integrations.

---

# Executive Summary

Atlas One is an agent-native integration layer for N-ATLAS, Nigeria's open-source multilingual AI model family.

Rather than requiring developers to manually learn SDKs, configure endpoints, install provider-specific packages and debug model integrations, Atlas One allows developers to delegate the integration process to their existing coding agents.

A developer working in Cursor, Codex or another compatible agent environment can instruct their agent to integrate N-ATLAS into an existing application.

Atlas One provides the infrastructure necessary for the agent to discover N-ATLAS capabilities, establish authorised access, test genuine model inference and diagnose failures.

The coding agent performs code modifications using its existing development tools. Atlas One supplies model access and structured integration capabilities.

**Core product promise:**

An existing software project should receive a secure, functional N-ATLAS integration through a developer-directed coding agent, with verifiable proof that genuine model inference succeeded.

Atlas One is not another coding agent, playground clone or SDK catalogue.

MCP is the interface through which coding agents integrate N-ATLAS. The inference API serves the finished application independently of the coding agent.

## Product positioning

| Decision | Position |
|---|---|
| Primary audience | Software developers using AI coding agents |
| Core promise | Connect once, instruct an agent, verify genuine N-ATLAS integration |
| Primary interface | Remote MCP server |
| Application interface | OpenAI-compatible inference API |
| Initial environments | Cursor and Codex |
| Main differentiator | Agent-native, end-to-end integration workflow |
| Not the product | Another coding agent, standalone playground or collection of SDKs |

---

# 1. Problem and Opportunity

## 1.1 Background

Developers increasingly build software by instructing coding agents rather than manually writing every integration.

However, most model infrastructure remains designed around traditional development workflows:

- Read documentation.
- Obtain an API key.
- Install an SDK.
- Configure an endpoint.
- Write integration code.
- Test the connection.
- Troubleshoot deployment or inference failures.

Coding agents can perform many of these tasks, but existing tools do not necessarily provide a consistent, structured and verifiable workflow for integrating N-ATLAS.

Developers still encounter problems involving model discovery, authentication, provider configuration, hardware availability, model inference, secret management and error diagnosis.

## 1.2 The actual problem

N-ATLAS may be available as an open-source model, but connecting it to real applications still requires several technical decisions and manual configuration steps.

The opportunity is to make N-ATLAS directly usable by the coding agents developers already employ.

## 1.3 Job to be done

"When I tell my coding agent to add a Nigerian-language AI capability to my existing application, I want it to connect genuine N-ATLAS inference and verify that my application works, without forcing me to learn another provider-specific SDK."

## 1.4 Product hypothesis

By providing coding agents with standardised N-ATLAS discovery, connection, inference testing and diagnostics through MCP, Atlas One can reduce the developer effort required to integrate N-ATLAS.

This hypothesis must be tested against conventional SDK and API integration workflows.

---

# 2. Product Identity and Positioning

## Name

Atlas One

Working name, pending branding and trademark review.

## Primary tagline

**N-ATLAS, one instruction away.**

## Supporting tagline

**Connect once. Build through your agent.**

## One-sentence pitch

Atlas One gives coding agents a standard, secure way to connect, integrate, test and troubleshoot N-ATLAS inside existing applications.

## Judge-facing explanation

Developers describe the feature they want. Their coding agents integrate N-ATLAS. Atlas One provides verified model access, integration guidance and diagnostics.

## Vision

Make N-ATLAS a model family that compatible coding agents can discover, understand and integrate into real software.

## Positioning boundaries

"One instruction away" describes the intended workflow after initial authorisation and access to a functioning inference backend.

It must not be presented as a promise of:

- Zero authentication or initial setup.
- Guaranteed free GPU computing.
- Guaranteed 24/7 inference availability.
- Autonomous code changes without developer approval.
- Compatibility with every coding agent or application framework.

---

# 3. Target Users and Use Cases

## Primary user: AI-assisted application developer

An engineer already working with Cursor, Codex or another agent-enabled coding environment.

**Existing behaviour:** Uses coding agents to develop a Next.js or TypeScript application.

**Desired outcome:** Instructs the agent to add Hausa or Yoruba AI functionality and obtains a working, tested application integration.

## Secondary user: Backend or AI engineer

An engineer who wants N-ATLAS access through existing terminal, HTTP and backend conventions.

**Existing behaviour:** Builds APIs and model integrations with conventional tooling.

**Desired outcome:** Uses one coding-agent connection to discover model capabilities and establish a functional backend integration.

## Third user: Technical reviewer or beta tester

Someone validating whether an N-ATLAS integration genuinely works.

**Desired outcome:** Independently reruns tests, inspects the relevant implementation and verifies that genuine N-ATLAS inference was used.

## Initial supported scope

The MVP focuses on text generation using actual N-ATLAS model weights.

Speech recognition, speech synthesis, fine-tuning and other model-family capabilities are deferred until their availability and integration have been independently demonstrated.

---

# 4. Canonical User Journey

The product must support one complete end-to-end integration workflow.

## Step 1: Connect Atlas One

The developer registers Atlas One as an MCP server in a compatible coding environment.

Cursor is the first supported environment.

Codex is the second environment targeted for compatibility testing.

The MCP server should be reusable across projects where the coding environment supports a user-level connection.

## Step 2: Authenticate

The developer authorises access through a browser-based authentication flow.

The authorisation must identify the appropriate user and project permissions.

The developer must understand whether real inference capacity is available and what restrictions apply.

## Step 3: Open an existing project

The developer opens an existing Next.js/TypeScript application.

They issue a natural-language instruction to their coding agent:

"Add a Hausa customer-support response route powered by N-ATLAS, and test it."

## Step 4: Agent discovers N-ATLAS

The agent uses Atlas One's MCP tools to retrieve:

- Supported model identifiers.
- Available capabilities.
- Backend health.
- Access requirements.
- Applicable integration guidance.
- Usage restrictions.

If the inference backend is unavailable, the agent must report the problem instead of presenting simulated output as a successful result.

## Step 5: Agent inspects the codebase

The coding agent uses its existing repository inspection and file-editing capabilities.

Atlas One does not need unrestricted access to the developer's local files.

The agent identifies the project's framework, backend structure, existing dependencies and suitable integration location.

## Step 6: Establish project access

Atlas One provisions or identifies an authorised project binding.

Credentials must remain scoped to the intended project.

Secrets must never be committed to the repository, exposed in client-side code or returned in diagnostic tool responses.

## Step 7: Integrate N-ATLAS

The coding agent prepares the required server-side integration.

For the first supported stack, the integration should use existing Next.js conventions and an OpenAI-compatible API client.

The agent should propose changes and obtain developer approval before modifying sensitive configuration.

## Step 8: Verify real inference

The agent runs an actual model request through the completed application's backend route.

Verification must demonstrate:

- The application route works.
- The request reached a genuine N-ATLAS inference backend.
- A model response was received.
- The response can be attributed to the expected model.
- Relevant timing and request metadata are available.

## Step 9: Present completion evidence

The developer receives a clear report containing:

- Modified files.
- Integration status.
- Model identifier.
- Request identifier.
- Observed latency.
- Test result.
- Relevant failures.
- Remaining manual actions, where necessary.

The developer can review and accept or reject the proposed changes.

---

# 5. MVP Functional Requirements

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| P0-01 | MCP registration | Cursor connects to the remote server, discovers its tools and reconnects after restart. |
| P0-02 | Authorisation | Unauthorised calls fail safely. Authorised requests enforce the correct permissions. |
| P0-03 | Model discovery | Agent receives genuine model IDs, capabilities, serving status, limits and attribution requirements. |
| P0-04 | Project binding | A project can be bound securely, repeatedly without duplicate creation, and revoked. |
| P0-05 | Genuine inference | Tests execute actual N-ATLAS model inference, not GPT, Claude or mocked substitutions. |
| P0-06 | Integration guidance | The agent receives valid instructions for integrating with an existing Next.js application. |
| P0-07 | Verification | The system validates model inference and the completed application route separately. |
| P0-08 | Diagnostics | The agent can inspect scoped request counts, errors, request IDs and observed latency. |
| P0-09 | Safety | The agent obtains approval for sensitive configuration, credential and deployment changes. |

## Product priorities

The first release should optimise for a reliable integration experience rather than maximum feature coverage.

It should support one application framework exceptionally well before expanding to additional frameworks.

---

# 6. MCP Interface and Tool Contracts

Atlas One uses the Model Context Protocol to expose its capabilities to coding agents.

The MCP server should provide a small, clearly documented tool surface.

Every tool should return structured, machine-readable results with predictable error formats.

## Tool 1: atlas_discover

**Purpose:** Allow a coding agent to understand available N-ATLAS capabilities.

Expected output:

- Supported model IDs.
- Model availability.
- Supported modalities and documented language capabilities.
- Authentication requirements.
- Usage limitations.
- Required model attribution.
- Integration recipe references.

The tool must distinguish a healthy API gateway from a reachable model-serving backend.

## Tool 2: atlas_bind_project

**Purpose:** Associate the developer's project with authorised N-ATLAS access.

Responsibilities:

- Identify or create a project binding.
- Validate permissions.
- Provide safe credential-placement instructions.
- Prevent duplicate project bindings.
- Support revocation.

The tool must not reveal platform master credentials.

Sensitive operations require explicit developer consent.

## Tool 3: atlas_test

**Purpose:** Execute a bounded test against genuine N-ATLAS inference.

Expected output:

- Request ID.
- Model identifier.
- Model provenance.
- Test status.
- Observed latency.
- Validation details.
- Errors where applicable.

A successful gateway health check alone does not count as successful model inference.

## Tool 4: atlas_inspect

**Purpose:** Allow the agent to inspect integration problems and project usage.

Expected output:

- Project-scoped request counts.
- Recent errors.
- Request IDs.
- Latency information.
- Authentication failures.
- Backend availability problems.
- Retryable versus non-retryable error classifications.

Raw prompt and response content should not be stored or returned by default.

## Optional MCP resources

The server may also expose:

- Next.js integration recipes.
- Model capability manifests.
- API documentation.
- Standardised error definitions.

These resources should remain small, stable and easy for coding agents to retrieve.

## Important architecture constraint

Atlas One MCP is not a remote file-editing agent.

Cursor or Codex handles local repository inspection and modification through its existing coding capabilities.

Atlas One supplies the model-specific information, authorised access and testing operations.

---

# 7. System Architecture

## High-level architecture

**Agent integration path**

Developer instruction  
→ Cursor / Codex  
→ Atlas One MCP server  
→ Atlas One control plane  
→ Model discovery, authentication, project binding and diagnostics

**Application inference path**

Finished application  
→ Atlas One inference API  
→ Genuine N-ATLAS runtime  
→ Generated response  
→ Application

**Usage metadata path**

API request  
→ Request metadata collection  
→ Project-scoped database records  
→ Atlas One diagnostics through MCP

## Architectural principle

The coding agent performs the integration, but the finished application must continue working independently after the agent session ends.

The application should never require an active MCP connection to serve its users.

## Recommended implementation stack

| Component | Proposed Technology |
|---|---|
| MCP server | TypeScript, official MCP SDK, Streamable HTTP |
| API gateway | Node.js with Fastify or NestJS |
| Database | PostgreSQL / Supabase Postgres |
| Authentication | OAuth-compatible authorisation flow |
| Application API | OpenAI-compatible inference interface |
| Inference runtime | Verified vLLM or llama.cpp deployment |
| Rate limiting | Lightweight gateway rate limiter |
| Developer environment | Cursor initially, Codex compatibility second |
| Documentation | Lightweight web documentation, optionally Vercel |

These are proposed implementation choices, not claims of an already deployed system.

## Model infrastructure requirement

Genuine N-ATLAS inference must be established before the rest of the platform can be considered operational.

A hosted endpoint requires actual GPU computing resources and available model weights.

Atlas One may later support developer-owned N-ATLAS endpoints, but that must not be confused with providing always-on hosted inference.

If the service depends on an external or developer-owned runtime, the product must disclose this clearly.

---

# 8. Security, Privacy and Licensing

Security is a core requirement because coding agents may work with application source code and credentials.

## Authentication

- Use OAuth-based authorisation for remote MCP access.
- Require HTTPS.
- Enforce appropriate token audiences and scopes.
- Validate project ownership and permissions.
- Reject unauthorised requests.

## Credentials

- Keep inference credentials in approved server-side secret storage.
- Never return master credentials through MCP tools.
- Never place server keys in browser-delivered application bundles.
- Never commit credentials to Git.
- Support credential revocation.
- Require developer approval before sensitive credential changes.

## Project isolation

Each project must have independently enforceable access permissions.

Usage data from one project must not be exposed to another project.

## Request protection

Implement:

- API request validation.
- Per-project quotas.
- Rate limiting.
- Request-size limits.
- Execution timeouts.
- Audit records.
- Safe error handling.

## Privacy

Store request metadata by default, not raw prompts and completions.

Prompt and response retention must require a separate, explicit policy and user consent where applicable.

## Upstream endpoint security

If developer-owned inference endpoints are supported, Atlas One must prevent arbitrary unsafe network destinations.

Use validated or allowlisted origins and appropriate server-side request forgery protections.

## N-ATLAS licensing

The product must respect published N-ATLAS licence requirements.

This includes applicable attribution such as "Powered by Awarri" and restrictions on commercial or large-scale use.

The published standard licence includes an active-end-user limitation requiring separate arrangements for usage beyond the permitted threshold.

Atlas One must not bypass these restrictions through proxying or shared access.

## Capability claims

Do not claim production-ready capabilities that have not been tested against genuine N-ATLAS inference.

This includes structured tool calling, speech modalities, streaming guarantees and multilingual correctness.

---

# 9. Failure States and Recovery

A professional developer tool must handle unsuccessful operations accurately.

| Failure | Expected Behaviour |
|---|---|
| Model backend offline | Return MODEL_OFFLINE and relevant diagnostics. Never fabricate model output. |
| Model access not approved | Explain gated model access, terms and required authorisation. |
| Expired access token | Return AUTH_REQUIRED and allow reauthorisation. |
| Insufficient inference compute | Return INFERENCE_UNAVAILABLE with clear prerequisites. |
| Unsupported project framework | Provide manual integration guidance rather than blindly modifying files. |
| Request timeout | Return a structured timeout error and request ID. |
| Rate limit reached | Report quota status and bounded retry guidance. |
| Model produces invalid output | Report the actual failed validation. |
| Application test fails | Do not mark the integration as complete. |
| Project key revoked | Deny further access without affecting unrelated projects. |

A central rule of Atlas One is that the coding agent should know the difference between an actual successful operation and a plausible-looking generated answer.

---

# 10. Product Acceptance Tests

The MVP can only be considered complete after successful end-to-end tests against genuine N-ATLAS inference.

## Test 1: First real response

A newly connected coding agent must be able to execute an authorised N-ATLAS test and receive a real model response with provenance and timing metadata.

## Test 2: Existing-project integration

Use an existing Next.js repository that does not already contain an N-ATLAS feature.

Ask the coding agent to add the integration.

The resulting server-side application route must work.

No inference secret may appear in the client bundle or committed repository.

## Test 3: Reproducibility

At least two external beta developers must reproduce the workflow without the development team performing the integration for them.

## Test 4: Failure integrity

Intentionally disable the inference backend.

Atlas One must report the outage correctly.

The coding agent must not declare the integration successful.

## Test 5: Credential revocation

Revoke a project's access key.

The project must lose access, while unrelated projects remain unaffected.

## Test 6: Comparative advantage

Compare the same application integration performed using:

- Conventional OpenAtlas documentation and SDK access.
- Atlas One through a coding agent.

Measure:

- Time to first successful inference.
- Number of manual developer actions.
- Number of configuration errors.
- Successful integration rate.
- Final application correctness.

## Initial success hypothesis

After MCP installation and authorisation, the median time to a successful application-level inference should be under 10 minutes for the supported framework.

This is a target, not an observed benchmark.

Actual test results must be reported even if they do not meet the target.

---

# 11. Scope and Implementation Sequence

## MVP scope

Build only what is required to prove the core product promise.

**Included:**

- One genuine N-ATLAS text inference backend.
- One remote MCP server.
- Four core MCP tools.
- Basic secure authorisation.
- Project binding.
- OpenAI-compatible application inference.
- One supported framework: Next.js.
- Application-level verification.
- Basic project usage diagnostics.
- Structured error handling.
- External beta testing.

**Excluded from the initial MVP:**

- Dedicated VS Code sidebar.
- Large analytics dashboard.
- GPU marketplace.
- Multiple hosting-provider marketplace.
- Extensive SDK library.
- Fine-tuning platform.
- Advanced speech workflows.
- Broad framework support.
- Autonomous deployment infrastructure.

## Development Phase A: Prove model access

Objective: Establish genuine N-ATLAS inference.

Tasks:

1. Obtain authorised access to genuine model weights.
2. Select a compatible inference runtime.
3. Start model serving on available compute.
4. Execute a real text-generation request.
5. Record model provenance, latency and backend errors.

Exit condition: Genuine N-ATLAS inference works and can be reproduced.

## Development Phase B: Build the inference API

Objective: Create the application-facing interface.

Tasks:

1. Implement an OpenAI-compatible inference route.
2. Add project-scoped authentication.
3. Introduce rate limits and request validation.
4. Connect the route to the actual inference backend.
5. Record request IDs and usage metadata.
6. Verify that streaming works before advertising it.

Exit condition: An ordinary server-side application can make authenticated requests successfully.

## Development Phase C: Build MCP discovery and testing

Objective: Make the inference service understandable to coding agents.

Tasks:

1. Implement the remote MCP server.
2. Register it in Cursor.
3. Expose atlas_discover.
4. Expose atlas_test.
5. Return structured results.
6. Verify correct failures when inference is unavailable.

Exit condition: Cursor can discover and test real N-ATLAS inference through MCP.

## Development Phase D: Project integration

Objective: Allow an agent to integrate N-ATLAS into an existing application.

Tasks:

1. Implement project binding.
2. Provide a Next.js integration recipe.
3. Define safe credential-handling procedures.
4. Have the coding agent inspect an existing project.
5. Produce and review the required code changes.
6. Run an application-level inference test.

Exit condition: An existing Next.js application gains a functioning N-ATLAS feature.

## Development Phase E: Diagnostics and validation

Objective: Prove usefulness and reliability.

Tasks:

1. Implement atlas_inspect.
2. Add scoped request metadata.
3. Test authentication and backend failures.
4. Test credential revocation.
5. Reproduce the integration in another project.
6. Conduct external developer testing.
7. Compare against conventional OpenAtlas integration.

Exit condition: The team can show both successful integration and evidence of measurable developer benefit.

---

# 12. Competition Strategy and Go/No-Go Decision

## Competition context

OpenAtlas is a credible competing project.

It already offers a published TypeScript SDK, API gateway, documented deployment approaches and application starter kits.

Atlas One should not attempt to win by making unsupported claims about being faster, cheaper or more scalable.

Its intended advantage is reducing integration effort when developers use coding agents.

## Differentiation

**OpenAtlas:** Helps developers use N-ATLAS through SDKs and APIs.

**Atlas One:** Helps developers direct coding agents to integrate N-ATLAS into existing applications.

This differentiation must be demonstrated through real usage, not branding alone.

## Go criteria

Continue with the product only if:

1. Genuine N-ATLAS inference can be demonstrated.
2. The MCP connection works with a supported coding agent.
3. A real existing application can be integrated.
4. Secret handling and project permissions are safe.
5. External developers can reproduce the workflow.
6. The experience is meaningfully easier than the conventional baseline.

If these conditions cannot be demonstrated, narrow the claims or revise the product rather than simulate success.

---

# Appendix A: Proposed Demonstration

The demonstration should prove one complete workflow.

**Scene 1: Existing application** — Show a real Next.js application without N-ATLAS integration. The coding agent has an Atlas One MCP connection configured.

**Scene 2: Natural-language instruction** — The developer asks: "Add a Hausa Q&A endpoint using N-ATLAS to this app, and verify it."

**Scene 3: Agent integration** — Show the agent discovering model capabilities, checking backend availability, obtaining consent and preparing source-code changes.

**Scene 4: Working application** — Execute a real request against the application's completed API route. Show a genuine N-ATLAS response, model provenance, attribution and request ID.

**Scene 5: Failure demonstration** — Disable the model backend temporarily. Show that Atlas One detects the failure correctly instead of reporting false success.

**Scene 6: Developer evidence** — Show project-level usage records, changed files and independent beta-test evidence.

---

# Appendix B: Reference Resources

- Official NAIC Challenge — https://ncair.nitda.gov.ng/naic/
- Official N-ATLAS Model and Licence — https://huggingface.co/NCAIR1/N-ATLaS
- OpenAtlas Competitor Repository — https://github.com/Benedict258/OpenAtlas
- Cursor MCP Documentation — https://prod.cursor.com/docs/mcp
- MCP TypeScript SDK — https://ts.sdk.modelcontextprotocol.io/server
- MCP Authorisation Specification — https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/index.mdx
- OpenAI Codex MCP Setup Reference — https://developers.openai.com/resources/docs-mcp

---

# Final Product Principle

**Atlas One should make N-ATLAS usable through the coding agents developers already trust.**

Its value is not the number of SDKs, frameworks, models or dashboard features it supports.

Its value is proving that a developer can describe an N-ATLAS-powered feature, allow their coding agent to integrate it, and receive a verified working application with less manual effort.

**One connection. One instruction. One verified integration.**

**Atlas One — N-ATLAS, one instruction away.**
