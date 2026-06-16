## Description: <br>
Generate Draw.io architecture diagrams, Mermaid diagrams, and Excalidraw sketches from structured specifications using the mcp-diagram-generator MCP server. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[matthewyin](https://clawhub.ai/user/matthewyin) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
Developers and engineers use this skill to choose a diagram format, prepare structured diagram specifications, and generate Draw.io, Mermaid, or Excalidraw files for architecture, topology, workflow, and documentation diagrams. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The companion MCP server can write diagram files and may overwrite an existing diagram when custom paths or filenames are reused. <br>
Mitigation: Prefer default diagram folders and timestamped filenames, review any custom output_path or filename, and explicitly confirm before overwriting files. <br>
Risk: Generated diagrams can be misleading if coordinates, hierarchy, or schema fields are incorrect. <br>
Mitigation: Use the bundled schema, topology, layout, and troubleshooting references before generation and review the rendered diagram before relying on it. <br>


## Reference(s): <br>
- [Format Selection Guide](references/format-selection-guide.md) <br>
- [JSON Schema Guide](references/json-schema-guide.md) <br>
- [Network Topology & Auto-Layout Specifications](references/topology-and-layout-spec.md) <br>
- [Network Topology Examples](references/network-topology-examples.md) <br>
- [MCP Server Setup & Troubleshooting](references/setup-and-troubleshooting.md) <br>
- [JSON Schema Draft 7](http://json-schema.org/draft-07/schema#) <br>


## Skill Output: <br>
**Output Type(s):** [Text, Markdown, Code, Configuration, Shell commands, Guidance] <br>
**Output Format:** [Markdown with JSON specifications and MCP tool invocation guidance] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May produce diagram files through the companion MCP server; review custom output paths and filenames before writing or overwriting files.] <br>

## Skill Version(s): <br>
1.1.5 (source: release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
