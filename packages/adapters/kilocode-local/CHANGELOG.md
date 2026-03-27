# Changelog

All notable changes to the @paperclipai/adapter-kilocode-local adapter will be documented in this file.

## [Unreleased]

### Added
- Initial release of kilocode_local adapter
- Support for KiloCode CLI execution with --auto --format json flags
- Session management via --session flag
- Model discovery via `kilo models` command
- Environment variable PAPERCLIP_KILOCODE_COMMAND for command override
- Skills injection from ~/.claude/skills/
- UI configuration builder and stdout parser
- CLI stream event formatter
- Full test coverage for parse and models modules
