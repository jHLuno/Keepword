export type LogMetadata = Readonly<Record<string, boolean | number | string | null>>;

export type Logger = Readonly<{
  info: (event: string, metadata: LogMetadata) => void;
  error: (event: string, metadata: LogMetadata) => void;
}>;

function writeLog(
  output: NodeJS.WriteStream,
  level: 'error' | 'info',
  event: string,
  metadata: LogMetadata,
): void {
  output.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event_name: event,
    ...metadata,
  })}\n`);
}

export function createLogger(): Logger {
  return {
    info(event, metadata) {
      writeLog(process.stdout, 'info', event, metadata);
    },
    error(event, metadata) {
      writeLog(process.stderr, 'error', event, metadata);
    },
  };
}
