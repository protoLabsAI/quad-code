/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter as OTLPLogExporterHttp } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterHttp } from '@opentelemetry/exporter-metrics-otlp-http';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import { initializeMetrics } from './metrics.js';
import {
  FileLogExporter,
  FileMetricExporter,
  FileSpanExporter,
} from './file-exporters.js';
import { createDebugLogger } from '../utils/debugLogger.js';

// OTEL diagnostics are silenced by default to prevent connection errors from
// leaking into the terminal. Set PROTO_OTEL_DEBUG=1 to enable verbose logging.
if (process.env?.['PROTO_OTEL_DEBUG']) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

let sdk: NodeSDK | undefined;
let telemetryInitialized = false;

interface LangfuseExporters {
  spanProcessor: BatchSpanProcessor;
  logExporter: OTLPLogExporterHttp;
  metricExporter: OTLPMetricExporterHttp;
}

function buildLangfuseExporters(): LangfuseExporters | null {
  const publicKey = process.env['LANGFUSE_PUBLIC_KEY'];
  const secretKey = process.env['LANGFUSE_SECRET_KEY'];
  const baseUrl =
    process.env['LANGFUSE_BASE_URL'] ?? 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    return null;
  }

  const credentials = Buffer.from(`${publicKey}:${secretKey}`).toString(
    'base64',
  );
  const headers = { Authorization: `Basic ${credentials}` };

  const spanProcessor = new BatchSpanProcessor(
    new OTLPTraceExporterHttp({
      url: `${baseUrl}/api/public/otel/v1/traces`,
      headers,
    }),
  );
  const logExporter = new OTLPLogExporterHttp({
    url: `${baseUrl}/api/public/otel/v1/logs`,
    headers,
  });
  const metricExporter = new OTLPMetricExporterHttp({
    url: `${baseUrl}/api/public/otel/v1/metrics`,
    headers,
  });

  return { spanProcessor, logExporter, metricExporter };
}

export function isTelemetrySdkInitialized(): boolean {
  return telemetryInitialized;
}

function parseOtlpEndpoint(
  otlpEndpointSetting: string | undefined,
  protocol: 'grpc' | 'http',
): string | undefined {
  if (!otlpEndpointSetting) {
    return undefined;
  }
  // Trim leading/trailing quotes that might come from env variables
  const trimmedEndpoint = otlpEndpointSetting.replace(/^["']|["']$/g, '');

  try {
    const url = new URL(trimmedEndpoint);
    if (protocol === 'grpc') {
      // OTLP gRPC exporters expect an endpoint in the format scheme://host:port
      // The `origin` property provides this, stripping any path, query, or hash.
      return url.origin;
    }
    // For http, use the full href.
    return url.href;
  } catch (error) {
    diag.error('Invalid OTLP endpoint URL provided:', trimmedEndpoint, error);
    return undefined;
  }
}

export function initializeTelemetry(config: Config): void {
  const langfuse = buildLangfuseExporters();
  if (telemetryInitialized || (!config.getTelemetryEnabled() && !langfuse)) {
    return;
  }

  const debugLogger = createDebugLogger('OTEL');
  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.version,
    'session.id': config.getSessionId(),
  });

  const otlpEndpoint = config.getTelemetryOtlpEndpoint();
  const otlpProtocol = config.getTelemetryOtlpProtocol();
  const parsedEndpoint = parseOtlpEndpoint(otlpEndpoint, otlpProtocol);
  const telemetryOutfile = config.getTelemetryOutfile();
  const useOtlp = !!parsedEndpoint && !telemetryOutfile;

  // No destination configured — skip SDK init to avoid flooding the console.
  if (!useOtlp && !telemetryOutfile && !langfuse) {
    return;
  }

  let spanExporter:
    | OTLPTraceExporter
    | OTLPTraceExporterHttp
    | FileSpanExporter
    | ConsoleSpanExporter;
  let logExporter: OTLPLogExporter | OTLPLogExporterHttp | FileLogExporter;
  let metricReader: PeriodicExportingMetricReader;

  if (useOtlp) {
    if (otlpProtocol === 'http') {
      spanExporter = new OTLPTraceExporterHttp({
        url: parsedEndpoint,
      });
      logExporter = new OTLPLogExporterHttp({
        url: parsedEndpoint,
      });
      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporterHttp({
          url: parsedEndpoint,
        }),
        exportIntervalMillis: 10000,
      });
    } else {
      // grpc
      spanExporter = new OTLPTraceExporter({
        url: parsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      });
      logExporter = new OTLPLogExporter({
        url: parsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      });
      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: parsedEndpoint,
          compression: CompressionAlgorithm.GZIP,
        }),
        exportIntervalMillis: 10000,
      });
    }
  } else if (telemetryOutfile) {
    spanExporter = new FileSpanExporter(telemetryOutfile);
    logExporter = new FileLogExporter(telemetryOutfile);
    metricReader = new PeriodicExportingMetricReader({
      exporter: new FileMetricExporter(telemetryOutfile),
      exportIntervalMillis: 10000,
    });
  } else {
    // Langfuse-only: route logs and metrics to Langfuse OTLP endpoints so they
    // don't fall back to the console exporters and spam the terminal.
    spanExporter = new ConsoleSpanExporter(); // unused — langfuse.spanProcessor handles spans
    logExporter = langfuse!.logExporter;
    metricReader = new PeriodicExportingMetricReader({
      exporter: langfuse!.metricExporter,
      exportIntervalMillis: 10000,
    });
  }

  const spanProcessors: BatchSpanProcessor[] = [];
  if (useOtlp || telemetryOutfile) {
    spanProcessors.push(new BatchSpanProcessor(spanExporter!));
  }
  if (langfuse) {
    spanProcessors.push(langfuse.spanProcessor);
    debugLogger.debug('Langfuse span processor enabled.');
  }

  sdk = new NodeSDK({
    resource,
    spanProcessors,
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    metricReader,
    instrumentations: [new HttpInstrumentation()],
  });

  try {
    sdk.start();
    debugLogger.debug('OpenTelemetry SDK started successfully.');
    telemetryInitialized = true;
    initializeMetrics(config);
  } catch (error) {
    debugLogger.error('Error starting OpenTelemetry SDK:', error);
  }

  process.on('SIGTERM', () => {
    shutdownTelemetry();
  });
  process.on('SIGINT', () => {
    shutdownTelemetry();
  });
  process.on('exit', () => {
    shutdownTelemetry();
  });
}

export async function shutdownTelemetry(): Promise<void> {
  if (!telemetryInitialized || !sdk) {
    return;
  }
  const debugLogger = createDebugLogger('OTEL');
  try {
    await sdk.shutdown();
    debugLogger.debug('OpenTelemetry SDK shut down successfully.');
  } catch (error) {
    debugLogger.error('Error shutting down SDK:', error);
  } finally {
    telemetryInitialized = false;
  }
}
