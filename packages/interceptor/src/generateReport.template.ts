/**
 * AI generated template for the report
 *
 * @author AI
 */

export enum ReportTestId {
    AVG_DURATION_CARD = "avg-duration-card",
    CHART_CONTAINER = "chart-container",
    CHART_CONTENT = "chart-content",
    CHART_SCROLL_AREA = "chart-scroll-area",
    CHART_WRAPPER = "chart-wrapper",
    CHART_Y_AXIS = "chart-y-axis",
    DATA_TABLE = "data-table",
    DURATION_CHART_CANVAS = "duration-chart-canvas",
    DURATION_COLUMN = "duration-column",
    EXPAND_COLUMN = "expand-column",
    LEGEND_FAST = "legend-fast",
    LEGEND_SLOW = "legend-slow",
    MAX_DURATION_CARD = "max-duration-card",
    METHOD_COLUMN = "method-column",
    MIN_DURATION_CARD = "min-duration-card",
    PERFORMANCE_LEGEND = "performance-legend",
    SCROLL_INDICATOR = "scroll-indicator",
    STATS_CONTAINER = "stats-container",
    TABLE_BODY = "table-body",
    TABLE_CONTAINER = "table-container",
    TABLE_HEADER = "table-header",
    TABLE_HEAD = "table-head",
    TIME_COLUMN = "time-column",
    TOTAL_REQUESTS_CARD = "total-requests-card",
    URL_COLUMN = "url-column",
    Y_AXIS_CANVAS = "y-axis-canvas"
}

export enum ReportTestIdPrefix {
    TABLE_ROW = "table-row",
    EXPAND_BTN = "expand-btn",
    DURATION_CELL = "duration-cell",
    EXPANDABLE_ROW = "expandable-row",
    FULL_URL_SECTION = "full-url-section",
    FULL_URL_CONTENT = "full-url-content",
    PARAMS_SECTION = "params-section",
    PARAMS_CONTENT = "params-content",
    HEADERS_SECTION = "headers-section",
    HEADERS_CONTENT = "headers-content",
    REQUEST_BODY_SECTION = "request-body-section",
    REQUEST_BODY_CONTENT = "request-body-content",
    RESPONSE_HEADERS_SECTION = "response-headers-section",
    RESPONSE_HEADERS_CONTENT = "response-headers-content",
    RESPONSE_BODY_SECTION = "response-body-section",
    RESPONSE_BODY_CONTENT = "response-body-content"
}

export enum ReportClassName {
    DURATION_FAST = "duration-fast",
    DURATION_SLOW = "duration-slow"
}

interface GetHtmlTemplateProps {
    avgDuration: string;
    dataCount: number;
    durations: string;
    generationDate: string;
    highDuration: number | null;
    highDurations: string;
    isSlow: string;
    isCustomHighDuration: boolean;
    labels: string;
    maxDuration: string;
    minDuration: string;
    tableData: string;
    title?: string;
    totalRequests: number;
}

export const getHtmlTemplate = ({
    avgDuration,
    dataCount,
    durations,
    generationDate,
    highDuration,
    highDurations,
    isSlow,
    isCustomHighDuration,
    labels,
    maxDuration,
    minDuration,
    tableData,
    title,
    totalRequests
}: GetHtmlTemplateProps) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Duration Over Time Report</title>
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #ffffff;
            min-height: 100vh;
            padding: 5px;
            background-image: 
                radial-gradient(circle at 20% 80%, rgba(120, 200, 80, 0.03) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(255, 100, 100, 0.03) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(200, 200, 200, 0.02) 0%, transparent 50%);
        }

        .container {
            max-width: 1500px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 25px;
            box-shadow: 
                0 25px 50px rgba(0, 0, 0, 0.08),
                0 0 0 1px rgba(255, 255, 255, 0.5),
                inset 0 1px 0 rgba(255, 255, 255, 0.6);
            overflow: hidden;
            backdrop-filter: blur(10px);
            border: 2px solid rgba(240, 240, 240, 0.8);
            width: 100%;
        }

        .header {
            background: linear-gradient(145deg, 
                rgba(255, 255, 255, 0.9) 0%, 
                rgba(248, 250, 252, 0.9) 50%, 
                rgba(241, 245, 249, 0.9) 100%);
            color: #2d3748;
            padding: 35px;
            text-align: center;
            border-bottom: 3px solid rgba(226, 232, 240, 0.6);
            position: relative;
            width: 100%;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, 
                #48bb78 0%, 
                #68d391 25%, 
                #fbb6ce 75%, 
                #f56565 100%);
        }

        .header h1 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 12px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            letter-spacing: -0.5px;
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.7;
            font-weight: 500;
            color: #4a5568;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 25px;
            padding: 25px;
            background: linear-gradient(135deg, 
                rgba(255, 255, 255, 0.8) 0%, 
                rgba(252, 254, 255, 0.8) 100%);
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.9);
            padding: 30px;
            border-radius: 20px;
            box-shadow: 
                0 8px 25px rgba(0, 0, 0, 0.04),
                0 0 0 1px rgba(255, 255, 255, 0.8),
                inset 0 1px 0 rgba(255, 255, 255, 0.9);
            text-align: center;
            border-left: 5px solid transparent;
            background-image: linear-gradient(white, white), 
                              linear-gradient(145deg, #48bb78, #f56565);
            background-origin: border-box;
            background-clip: padding-box, border-box;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 
                0 12px 35px rgba(0, 0, 0, 0.08),
                0 0 0 1px rgba(255, 255, 255, 0.9);
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, 
                transparent, 
                rgba(255, 255, 255, 0.4), 
                transparent);
            transition: left 0.5s;
        }

        .stat-card:hover::before {
            left: 100%;
        }

        .stat-value {
            font-size: 1.5rem;
            font-weight: 800;
            color: #2d3748;
            margin-bottom: 8px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .stat-label {
            font-size: 0.75rem;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .chart-container {
            padding: 5px;
            background: #ffffff;
        }

        .chart-wrapper {
            position: relative;
            height: 600px;
            background: #ffffff;
            border-radius: 20px;
            padding: 25px;
            box-shadow: 
                inset 0 2px 4px rgba(0, 0, 0, 0.02),
                0 1px 3px rgba(0, 0, 0, 0.05),
                0 0 0 1px rgba(226, 232, 240, 0.5);
            border: 1px solid rgba(226, 232, 240, 0.3);
            display: flex;
        }

        .chart-y-axis {
            position: sticky;
            left: 0;
            width: 40px;
            height: 100%;
            background: #ffffff;
            z-index: 10;
            border-right: 1px solid rgba(226, 232, 240, 0.3);
            flex-shrink: 0;
        }

        .chart-scroll-area {
            flex: 1;
            overflow-x: auto;
            overflow-y: hidden;
            height: 100%;
        }

        .chart-content {
            position: relative;
            height: 100%;
            min-width: 100%;
        }

        /* Custom scrollbar styling */
        .chart-wrapper::-webkit-scrollbar {
            height: 8px;
        }

        .chart-wrapper::-webkit-scrollbar-track {
            background: rgba(226, 232, 240, 0.3);
            border-radius: 4px;
        }

        .chart-wrapper::-webkit-scrollbar-thumb {
            background: linear-gradient(90deg, #48bb78, #f56565);
            border-radius: 4px;
        }

        .chart-wrapper::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(90deg, #38a169, #e53e3e);
        }

        .scroll-indicator {
            position: absolute;
            bottom: 5px;
            right: 20px;
            font-size: 12px;
            color: #718096;
            font-weight: 500;
            opacity: 0.7;
            pointer-events: none;
            z-index: 15;
        }

        .performance-legend {
            position: absolute;
            top: 15px;
            right: 25px;
            display: flex;
            gap: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            z-index: 15;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .legend-fast {
            color: #38a169;
        }

        .legend-slow {
            color: #e53e3e;
        }

        .legend-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .legend-dot.fast {
            background: linear-gradient(135deg, #48bb78, #38a169);
        }

        .legend-dot.slow {
            background: linear-gradient(135deg, #f56565, #e53e3e);
        }

        .table-container {
            padding: 45px;
            background: linear-gradient(135deg, 
                rgba(255, 255, 255, 0.8) 0%, 
                rgba(252, 254, 255, 0.8) 100%);
            border-top: 2px solid rgba(226, 232, 240, 0.4);
            width: 100%;
            overflow-x: auto;
            position: relative;
        }

        .table-container::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 30px;
            height: 100%;
            pointer-events: none;
            background: linear-gradient(to left, rgba(255,255,255,0.95) 60%, rgba(255,255,255,0));
            display: none;
        }

        .table-container.scrollable::after {
            display: block;
        }

        .table-header {
            text-align: center;
            margin-bottom: 30px;
        }

        .table-header h2 {
            font-size: 2rem;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 8px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .table-header p {
            font-size: 1rem;
            color: #718096;
            font-weight: 500;
        }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            background: rgba(255, 255, 255, 0.98);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.08),
                0 1px 2px rgba(0, 0, 0, 0.05),
                inset 0 1px 0 rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(226, 232, 240, 0.4);
            min-width: 600px;
        }

        .data-table th, .data-table td {
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
            max-width: 180px;
        }

        .data-table th {
            background: linear-gradient(135deg, 
                rgba(248, 250, 252, 0.98) 0%, 
                rgba(241, 245, 249, 0.98) 100%);
            color: #1a202c;
            font-weight: 600;
            padding: 18px 20px;
            text-align: left;
            font-size: 0.88rem;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            border-bottom: 2px solid rgba(226, 232, 240, 0.5);
            position: relative;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        }

        .data-table th:hover {
            background: linear-gradient(135deg, 
                rgba(238, 242, 255, 0.98) 0%, 
                rgba(224, 231, 255, 0.98) 100%);
            transform: translateY(-1px);
        }

        .data-table th.sortable::after {
            content: '↕️';
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.8rem;
            opacity: 0.5;
            transition: all 0.2s ease;
        }

        .data-table th.sortable:hover::after {
            opacity: 0.8;
        }

        .data-table th.sorted-asc::after {
            content: '🔼';
            opacity: 1;
            color: #3b82f6;
        }

        .data-table th.sorted-desc::after {
            content: '🔽';
            opacity: 1;
            color: #3b82f6;
        }

        .data-table td {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(226, 232, 240, 0.2);
            font-size: 0.92rem;
            color: #4a5568;
            background: rgba(255, 255, 255, 0.7);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            vertical-align: middle;
        }

        .data-table tbody tr:hover td {
            background: rgba(248, 251, 255, 0.9);
            box-shadow: inset 0 1px 0 rgba(99, 102, 241, 0.1);
        }

        .data-table tbody tr:last-child td {
            border-bottom: none;
        }

        .expand-btn {
            background: none;
            border: none;
            color: #4a5568;
            cursor: pointer;
            font-size: 1.2rem;
            padding: 4px 8px;
            border-radius: 6px;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
        }

        .expand-btn:hover {
            background: rgba(99, 102, 241, 0.1);
            color: #6366f1;
            transform: scale(1.1);
        }

        .expand-btn.expanded {
            transform: rotate(90deg);
            color: #6366f1;
        }

        .expand-btn.expanded:hover {
            transform: rotate(90deg) scale(1.1);
        }

        .expandable-content {
            display: none;
            background: rgba(248, 250, 252, 0.8);
            border-top: 1px solid rgba(226, 232, 240, 0.5);
        }

        .expandable-content.show {
            display: table-row;
        }

        .expandable-content td {
            padding: 0;
            border-bottom: 1px solid rgba(226, 232, 240, 0.2);
        }

        .expandable-details {
            padding: 25px;
            background: linear-gradient(135deg, 
                rgba(248, 250, 252, 0.95) 0%, 
                rgba(255, 255, 255, 0.95) 100%);
            margin: 0;
            border-radius: 12px;
            margin: 8px;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
        }

        .details-section {
            margin-bottom: 20px;
        }

        .details-section:last-child {
            margin-bottom: 0;
        }

        .details-title {
            font-size: 1rem;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .details-content {
            background: rgba(255, 255, 255, 0.8);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid rgba(226, 232, 240, 0.4);
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
            font-size: 0.875rem;
            line-height: 1.5;
        }

        .details-content.json {
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }

        .details-content.params {
            display: grid;
            gap: 8px;
        }

        .param-item {
            display: flex;
            background: rgba(248, 250, 252, 0.6);
            padding: 8px 12px;
            border-radius: 6px;
            border-left: 3px solid #6366f1;
        }

        .param-key {
            font-weight: 600;
            color: #374151;
            margin-right: 12px;
            min-width: 100px;
        }

        .param-value {
            color: #6b7280;
            word-break: break-all;
        }

        .empty-state {
            color: #9ca3af;
            font-style: italic;
            text-align: center;
            padding: 12px;
        }

        .url-cell {
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Courier New', monospace;
            font-size: 0.86rem;
            color: #2d3748;
            font-weight: 500;
            max-width: 350px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 1.4;
            position: relative;
        }

        .url-cell::before {
            content: '🔗';
            margin-right: 8px;
            font-size: 0.9rem;
            opacity: 0.6;
        }

        .shortened-url::after {
            content: '📎';
            position: absolute;
            right: 2px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.8rem;
            opacity: 0.7;
            pointer-events: none;
        }

        .time-cell {
            font-weight: 500;
            color: #4a5568;
            white-space: nowrap;
            font-size: 0.9rem;
            font-family: 'SF Mono', 'Monaco', monospace;
            position: relative;
        }

        .time-cell::before {
            content: '📅';
            margin-right: 8px;
            font-size: 0.85rem;
            opacity: 0.7;
        }

        .duration-cell {
            font-weight: 700;
            font-size: 1.05rem;
            text-align: right;
            font-family: 'SF Mono', 'Monaco', monospace;
            letter-spacing: 0.5px;
            position: relative;
        }

        .${ReportClassName.DURATION_FAST} {
            color: #22c55e;
            text-shadow: 0 1px 2px rgba(34, 197, 94, 0.2);
        }

        .${ReportClassName.DURATION_SLOW} {
            color: #ef4444;
            text-shadow: 0 1px 2px rgba(239, 68, 68, 0.2);
        }

        .duration-cell::before {
            content: '⚡';
            margin-right: 6px;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .${ReportClassName.DURATION_SLOW}::before {
            content: '🐌';
        }

        .footer {
            background: linear-gradient(135deg, 
                rgba(248, 250, 252, 0.9) 0%, 
                rgba(255, 255, 255, 0.9) 100%);
            padding: 25px;
            text-align: center;
            color: #718096;
            font-size: 0.95rem;
            font-weight: 500;
            border-top: 2px solid rgba(226, 232, 240, 0.4);
        }

        @media (max-width: 768px) {
            .container {
                max-width: 100vw;
                border-radius: 0;
                box-shadow: none;
                border: none;
                padding: 0;
            }
            .header {
                padding: 18px 5px 18px 5px;
            }
            .header h1 {
                font-size: 1.3rem;
            }
            .header p {
                font-size: 1rem;
            }
            .stats {
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                padding: 10px 5px;
            }
            .stat-card {
                padding: 12px 5px;
                border-radius: 10px;
            }
            .stat-value {
                font-size: 1.1rem;
            }
            .stat-label {
                font-size: 0.7rem;
            }
            .chart-container {
                padding: 5px;
            }
            .chart-wrapper {
                height: 220px;
                padding: 5px;
                border-radius: 10px;
            }
            .chart-y-axis {
                width: 28px;
            }
            .performance-legend {
                display: none !important;
            }
            .mobile-legend {
                display: flex !important;
                justify-content: center;
                gap: 32px;
            }
            .legend-item {
                flex-direction: row;
                align-items: center;
                margin-bottom: 2px;
            }
            .scroll-indicator {
                font-size: 9px;
                bottom: 2px;
                right: 5px;
            }
            .table-container {
                padding: 5px;
                border-radius: 0;
            }
            .data-table {
                font-size: 0.75rem;
                min-width: 420px;
            }
            .data-table th,
            .data-table td {
                padding: 8px 4px;
                max-width: 100px;
            }
            .url-cell {
                max-width: 90px;
                font-size: 0.7rem;
            }
            .time-cell {
                font-size: 0.7rem;
            }
            .duration-cell {
                font-size: 0.8rem;
            }
            .expand-btn {
                width: 22px;
                height: 22px;
                font-size: 0.9rem;
            }
            .expandable-details {
                padding: 7px;
                margin: 2px;
            }
            .details-title {
                font-size: 0.8rem;
            }
            .details-content {
                padding: 6px;
                font-size: 0.7rem;
            }
            .param-key {
                min-width: 60px;
                font-size: 0.7rem;
            }
            .param-value {
                font-size: 0.7rem;
            }
        }
        @media (max-width: 480px) {
            .container {
                max-width: 100vw;
                border-radius: 0;
                box-shadow: none;
                border: none;
                padding: 0;
            }
            .header {
                padding: 10px 2px 10px 2px;
            }
            .header h1 {
                font-size: 1rem;
            }
            .header p {
                font-size: 0.8rem;
            }
            .stats {
                grid-template-columns: 1fr 1fr;
                gap: 5px;
                padding: 5px 2px;
            }
            .stat-card {
                padding: 7px 2px;
                border-radius: 6px;
            }
            .stat-value {
                font-size: 0.9rem;
            }
            .stat-label {
                font-size: 0.6rem;
            }
            .chart-container {
                padding: 2px;
            }
            .chart-wrapper {
                /* Keep height at 220px for <=480px */
                height: 220px;
                padding: 2px;
                border-radius: 6px;
            }
            .chart-y-axis {
                width: 28px;
            }
            .performance-legend {
                font-size: 0.6rem;
                flex-direction: column;
                gap: 2px;
                align-items: flex-start;
            }
            .mobile-legend {
                justify-content: center;
                gap: 32px;
            }
            .legend-item {
                flex-direction: row;
                align-items: center;
                margin-bottom: 1px;
            }
            .table-container {
                padding: 2px;
                border-radius: 0;
            }
            .data-table {
                font-size: 0.65rem;
                min-width: 300px;
            }
            .data-table th,
            .data-table td {
                padding: 5px 2px;
                max-width: 60px;
            }
            .url-cell {
                max-width: 60px;
                font-size: 0.6rem;
            }
            .time-cell {
                font-size: 0.6rem;
            }
            .duration-cell {
                font-size: 0.7rem;
            }
            .expand-btn {
                width: 18px;
                height: 18px;
                font-size: 0.7rem;
            }
            .expandable-details {
                padding: 3px;
                margin: 1px;
            }
            .details-title {
                font-size: 0.7rem;
            }
            .details-content {
                padding: 3px;
                font-size: 0.6rem;
            }
            .param-key {
                min-width: 40px;
                font-size: 0.6rem;
            }
            .param-value {
                font-size: 0.6rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 ${title ?? "Duration Analysis Report"}</h1>
            <p>Performance metrics over time - ${dataCount} data points</p>
        </div>

        <div class="stats" data-testid="${ReportTestId.STATS_CONTAINER}">
            <div class="stat-card" data-testid="${ReportTestId.MAX_DURATION_CARD}">
                <div class="stat-value">${maxDuration}ms</div>
                <div class="stat-label">Max Duration</div>
            </div>
            <div class="stat-card" data-testid="${ReportTestId.MIN_DURATION_CARD}">
                <div class="stat-value">${minDuration}ms</div>
                <div class="stat-label">Min Duration</div>
            </div>
            <div class="stat-card" data-testid="${ReportTestId.AVG_DURATION_CARD}">
                <div class="stat-value">${avgDuration}ms</div>
                <div class="stat-label">Average Duration</div>
            </div>
            <div class="stat-card" data-testid="${ReportTestId.TOTAL_REQUESTS_CARD}">
                <div class="stat-value">${totalRequests}</div>
                <div class="stat-label">Total Requests</div>
            </div>
        </div>

        <div class="chart-container" data-testid="${ReportTestId.CHART_CONTAINER}">
            <div class="chart-wrapper" data-testid="${ReportTestId.CHART_WRAPPER}">
                <div class="performance-legend" data-testid="${ReportTestId.PERFORMANCE_LEGEND}">
                    <div class="legend-item" data-testid="${ReportTestId.LEGEND_FAST}">
                        <div class="legend-dot fast"></div>
                        <span class="legend-fast">Fast${!isCustomHighDuration ? ` (< ${highDuration}ms)` : ""}</span>
                    </div>
                    ${
                        isCustomHighDuration
                            ? `
                    <div class="legend-item" data-testid="${ReportTestId.LEGEND_SLOW}">
                        <div class="legend-dot slow"></div>
                        <span class="legend-slow">Custom</span>
                    </div>
                    `
                            : `
                    <div class="legend-item" data-testid="${ReportTestId.LEGEND_SLOW}">
                        <div class="legend-dot slow"></div>
                        <span class="legend-slow">Slow (≥ ${highDuration}ms)</span>
                    </div>
                    `
                    }
                </div>
                <div class="chart-y-axis" data-testid="${ReportTestId.CHART_Y_AXIS}">
                    <canvas id="yAxisChart" data-testid="${ReportTestId.Y_AXIS_CANVAS}"></canvas>
                </div>
                <div class="chart-scroll-area" data-testid="${ReportTestId.CHART_SCROLL_AREA}">
                    <div class="chart-content" data-testid="${ReportTestId.CHART_CONTENT}">
                        <canvas id="durationChart" data-testid="${ReportTestId.DURATION_CHART_CANVAS}"></canvas>
                    </div>
                    <div class="scroll-indicator" id="scrollIndicator" data-testid="${ReportTestId.SCROLL_INDICATOR}" style="display: none;">
                        ← Scroll to see more requests →
                    </div>
                </div>
            </div>
        </div>
        <!-- Mobile legend below the graph -->
        <div class="mobile-legend" aria-label="Performance legend" tabindex="0" style="display:none">
            <div class="legend-item">
                <div class="legend-dot fast"></div>
                <span class="legend-fast">Fast${!isCustomHighDuration ? ` (< ${highDuration}ms)` : ""}</span>
            </div>
            ${
                isCustomHighDuration
                    ? `
            <div class="legend-item">
                <div class="legend-dot slow"></div>
                <span class="legend-slow">Custom</span>
            </div>
            `
                    : `
            <div class="legend-item">
                <div class="legend-dot slow"></div>
                <span class="legend-slow">Slow (≥ ${highDuration}ms)</span>
            </div>
            `
            }
        </div>

        <div class="table-container" data-testid="${ReportTestId.TABLE_CONTAINER}">
            <div class="table-header" data-testid="${ReportTestId.TABLE_HEADER}">
                <h2>Request Details</h2>
                <p>Detailed breakdown of all requests sorted by time</p>
            </div>
            <table class="data-table" id="requestTable" data-testid="${ReportTestId.DATA_TABLE}">
                <thead data-testid="${ReportTestId.TABLE_HEAD}">
                    <tr>
                        <th style="width: 40px;" data-testid="${ReportTestId.EXPAND_COLUMN}">📋</th>
                        <th class="sortable" data-sort="url" data-testid="${ReportTestId.URL_COLUMN}">🌐 URL</th>
                        <th class="sortable" data-sort="method" data-testid="${ReportTestId.METHOD_COLUMN}">📝 Method</th>
                        <th class="sortable" data-sort="time" data-testid="${ReportTestId.TIME_COLUMN}">⏰ Time</th>
                        <th class="sortable" data-sort="duration" data-testid="${ReportTestId.DURATION_COLUMN}">⚡ Duration</th>
                    </tr>
                </thead>
                <tbody id="tableBody" data-testid="${ReportTestId.TABLE_BODY}">
                    <!-- Table rows will be populated by JavaScript -->
                </tbody>
            </table>
        </div>

        <div class="footer">
            Generated on ${generationDate} • Duration over Time Analysis
        </div>
    </div>

    <script>
        // Custom chart implementation using HTML5 Canvas
        const canvas = document.getElementById('durationChart');
        const ctx = canvas.getContext('2d');
        const yAxisCanvas = document.getElementById('yAxisChart');
        const yAxisCtx = yAxisCanvas.getContext('2d');
        
        // Data
        const labels = ${labels};
        const data = ${durations};
        const tableData = ${tableData};
        const highDuration = ${highDuration};
        const highDurations = JSON.parse('${highDurations}');
        const isSlow = JSON.parse('${isSlow}');
        const isCustomHighDuration = ${isCustomHighDuration};
        
        // Chart configuration
        const config = {
            padding: 60,
            yAxisPadding: 60,
            fastColor: '#48bb78',
            fastHoverColor: '#38a169',
            slowColor: '#f56565',
            slowHoverColor: '#e53e3e',
            textColor: '#2d3748',
            gridColor: '#e2e8f0',
            backgroundColor: '#ffffff',
            thresholdMs: highDuration
        };
        
        let hoveredIndex = -1;
        let tooltip = null;
        
        // Create tooltip element
        function createTooltip() {
            if (tooltip) return;
            tooltip = document.createElement('div');
            tooltip.style.cssText = \`
                position: fixed;
                background: rgba(15, 23, 42, 0.95);
                color: white;
                padding: 12px 16px;
                border-radius: 10px;
                font-size: 13px;
                pointer-events: none;
                z-index: 10000;
                display: none;
                box-shadow: 
                    0 10px 25px rgba(0, 0, 0, 0.2),
                    0 4px 10px rgba(0, 0, 0, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                line-height: 1.4;
                max-width: 300px;
                word-wrap: break-word;
            \`;
            document.body.appendChild(tooltip);
        }
        
        // Show tooltip
        function showTooltip(x, y, label, value, url) {
            if (!tooltip) createTooltip();
            const isFast = value < config.thresholdMs;
            const statusColor = isFast ? '#38a169' : '#e53e3e';
            
            tooltip.innerHTML = \`
                <div style="font-weight: 700; margin-bottom: 4px; font-family: 'Segoe UI', sans-serif;">
                    📅 \${label}
                </div>
                <div style="font-weight: 600; margin-bottom: 3px; color: #ffffff;">
                    ⏱️ Duration: \${value.toFixed(0)}ms
                </div>
                <div style="font-weight: 600; font-size: 13px; word-break: break-all;">
                    🔗&nbsp;Url:&nbsp;&nbsp;\${url}
                </div>
            \`;
            
            // Position tooltip near cursor with smart positioning
            const tooltipWidth = 200; // Approximate tooltip width
            const tooltipHeight = 80; // Approximate tooltip height
            const offset = 15; // Offset from cursor
            
            // Calculate position with boundary checks
            let tooltipX = x + offset;
            let tooltipY = y - tooltipHeight - offset;
            
            // Check right boundary
            if (tooltipX + tooltipWidth > window.innerWidth) {
                tooltipX = x - tooltipWidth - offset;
            }
            
            // Check top boundary
            if (tooltipY < 0) {
                tooltipY = y + offset;
            }
            
            // Check bottom boundary
            if (tooltipY + tooltipHeight > window.innerHeight) {
                tooltipY = y - tooltipHeight - offset;
            }
            
            // Ensure tooltip doesn't go off left edge
            if (tooltipX < 0) {
                tooltipX = offset;
            }
            
            tooltip.style.left = tooltipX + 'px';
            tooltip.style.top = tooltipY + 'px';
            tooltip.style.display = 'block';
        }
        
        // Hide tooltip
        function hideTooltip() {
            if (tooltip) tooltip.style.display = 'none';
        }
        
        // Resize canvas to fit container
        function resizeCanvas() {
            const container = canvas.parentElement;
            const scrollArea = container.parentElement;
            const yAxisContainer = yAxisCanvas.parentElement;
            const wrapper = scrollArea.parentElement;
            const dpr = window.devicePixelRatio || 1;
            const rect = wrapper.getBoundingClientRect();
            
            // Calculate minimum width needed for comfortable viewing
            const minBarWidth = 30; // Minimum bar width in pixels
            const barSpacing = 15; // Spacing between bars
            const minWidthPerBar = minBarWidth + barSpacing;
            // Determine Y-axis width based on media query
            let yAxisWidth = 40;
            if (window.matchMedia('(max-width: 768px)').matches) {
                yAxisWidth = 28;
            }
            const calculatedWidth = Math.max(
                data.length * minWidthPerBar + config.padding * 2,
                rect.width - yAxisWidth // Subtract Y-axis width
            );
            
            // Set container width to enable scrolling
            container.style.width = calculatedWidth + 'px';
            
            // Setup main chart canvas
            canvas.style.width = calculatedWidth + 'px';
            // We need extra space for the labels
            canvas.style.height = '100%';
            
            canvas.width = calculatedWidth * dpr;
            canvas.height = rect.height * dpr;
            
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = true;
            
            // Setup Y-axis canvas
            yAxisCanvas.style.width = yAxisWidth + 'px';
            yAxisCanvas.style.height = rect.height + 'px';
            yAxisCanvas.width = yAxisWidth * dpr;
            yAxisCanvas.height = rect.height * dpr;
            yAxisCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
            yAxisCtx.scale(dpr, dpr);
            yAxisCtx.imageSmoothingEnabled = true;
            
            drawChart(yAxisWidth);
        }
        
        // Centralized function to get bar rectangle
        function getBarRect(index) {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            const chartWidth = width - config.padding;
            const chartHeight = height - config.padding * 2;
            const chartX = 8;
            const chartY = config.padding;

            const minBarWidth = 30;
            const barSpacing = 15;
            const barWidth = Math.max(minBarWidth, (chartWidth - (data.length - 1) * barSpacing) / data.length);
            const actualBarSpacing = data.length > 1 ? (chartWidth - data.length * barWidth) / (data.length - 1) : 0;

            const value = data[index];
            const maxValue = Math.max(...data, 0);
            const yScale = maxValue > 0 ? chartHeight / maxValue : 1;
            const barHeight = value * yScale;
            const barX = chartX + index * (barWidth + actualBarSpacing);
            const barY = chartY + chartHeight - barHeight;

            return {
                x: barX,
                y: barY,
                width: barWidth,
                height: barHeight
            };
        }
        window.getBarCoordinates = function(index) {
            const dpr = window.devicePixelRatio || 1;
            const rect = getBarRect(index);
            return {
                x: Math.round(rect.x * dpr),
                y: Math.round(rect.y * dpr),
                width: Math.round(rect.width * dpr),
                height: Math.round(rect.height * dpr)
            };
        };
        
        // Draw the chart
        function drawChart(yAxisWidth = 40) {
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);
            const yAxisHeight = height;
            
            // Clear both canvases
            ctx.clearRect(0, 0, width, height);
            yAxisCtx.clearRect(0, 0, yAxisWidth, yAxisHeight);
            
            if (data.length === 0) {
                // Draw "No data" message on main canvas
                ctx.fillStyle = config.textColor;
                ctx.font = '18px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('No performance data available', width / 2, height / 2);
                return;
            }
            
            // Calculate chart area (main chart doesn't need left padding for Y-axis anymore)
            const chartWidth = width - config.padding;
            const chartHeight = height - config.padding * 2;
            const chartX = 8; // Smaller left margin
            const chartY = config.padding;
            
            // Y-axis chart area - must match exactly with main chart
            const yAxisChartHeight = chartHeight; // Same as main chart
            const yAxisChartY = chartY; // Same Y position as main chart
            
            // Find max value for scaling
            const maxValue = Math.max(...data, 0);
            const yScale = maxValue > 0 ? chartHeight / maxValue : 1; // Use chartHeight for consistency
            
            // Calculate bar dimensions with consistent spacing
            const minBarWidth = 30;
            const barSpacing = 15;
            const barWidth = Math.max(minBarWidth, (chartWidth - (data.length - 1) * barSpacing) / data.length);
            const actualBarSpacing = data.length > 1 ? (chartWidth - data.length * barWidth) / (data.length - 1) : 0;
            
            // Draw Y-axis on the fixed canvas
            yAxisCtx.strokeStyle = config.gridColor;
            yAxisCtx.lineWidth = 1;
            
            // Draw Y-axis labels and grid lines
            const gridLines = 5;
            for (let i = 0; i <= gridLines; i++) {
                const y = yAxisChartY + yAxisChartHeight - (i * yAxisChartHeight / gridLines);
                
                // Y-axis labels
                if (maxValue > 0) {
                    const value = (i * maxValue / gridLines).toFixed(0);
                    yAxisCtx.fillStyle = config.textColor;
                    yAxisCtx.font = '11px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                    yAxisCtx.textAlign = 'right';
                    yAxisCtx.fillText(value + 'ms', yAxisWidth - 2, y + 4);
                }
            }
            
            // Draw Y-axis title on fixed canvas
            yAxisCtx.fillStyle = config.textColor;
            yAxisCtx.font = '13px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            yAxisCtx.textAlign = 'center';
            yAxisCtx.fontWeight = '600';
            
            yAxisCtx.save();
            yAxisCtx.translate(yAxisWidth / 2 - 24, yAxisHeight / 2); // Add 24px padding from right
            yAxisCtx.rotate(-Math.PI / 2);
            yAxisCtx.fillText('📈 Duration (ms)', 0, 0);
            yAxisCtx.restore();
            
            // Draw main chart content on scrollable canvas
            ctx.strokeStyle = config.gridColor;
            ctx.lineWidth = 1;
            
            // Horizontal grid lines (extended from Y-axis)
            for (let i = 0; i <= gridLines; i++) {
                const y = chartY + chartHeight - (i * chartHeight / gridLines);
                ctx.beginPath();
                ctx.moveTo(chartX, y);
                ctx.lineTo(chartX + chartWidth, y);
                ctx.stroke();
            }
            
            // Draw bars
            data.forEach((value, index) => {
                const { x: barX, y: barY, width: barWidth, height: barHeight } = getBarRect(index);
                
                // Determine color based on per-request threshold
                let isBarSlow = false;
                if (isCustomHighDuration === true) {
                    isBarSlow = isSlow[index];
                } else {
                    isBarSlow = value >= config.thresholdMs;
                }
                const isFast = !isBarSlow;
                const baseColor = isFast ? config.fastColor : config.slowColor;
                const hoverColor = isFast ? config.fastHoverColor : config.slowHoverColor;
                const currentColor = hoveredIndex === index ? hoverColor : baseColor;
                
                // Create gradient with performance-based colors
                const gradient = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
                gradient.addColorStop(0, currentColor);
                gradient.addColorStop(0.5, currentColor + 'E6'); // 90% opacity
                gradient.addColorStop(1, currentColor + 'B3'); // 70% opacity
                
                // Draw bar with rounded corners effect
                ctx.fillStyle = gradient;
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Add subtle inner shadow for depth
                const shadowGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
                shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
                shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.01)');
                shadowGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
                
                ctx.fillStyle = shadowGradient;
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Draw bar border with enhanced styling
                ctx.strokeStyle = currentColor;
                ctx.lineWidth = hoveredIndex === index ? 3 : 2;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
                
                // Add performance indicator glow for hovered bars
                if (hoveredIndex === index) {
                    ctx.shadowColor = currentColor;
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
                    ctx.shadowBlur = 0;
                }
            });
            
            // Draw X-axis labels
            ctx.fillStyle = config.textColor;
            ctx.font = '11px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.textAlign = 'center';
            
            labels.forEach((label, index) => {
                const x = chartX + index * (barWidth + actualBarSpacing) + barWidth / 2;
                const y = chartY + chartHeight + 20;
                
                // Rotate text for better readability
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(label.length > 15 ? label.substring(0, 12) + '...' : label, 0, 0);
                ctx.restore();
            });
            
            // Draw X-axis title
            ctx.fillStyle = config.textColor;
            ctx.font = '15px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.textAlign = 'center';
            ctx.fontWeight = '600';
            ctx.fillText('⏰ Time Period', width / 2, height);
        }
        
        // Handle mouse events for interactivity
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const chartWidth = canvas.width / (window.devicePixelRatio || 1) - config.padding;
            const chartX = 8; // Small left margin to match drawChart
            // Calculate bar dimensions (same as in drawChart)
            const minBarWidth = 30;
            const barSpacing = 15;
            const barWidth = Math.max(minBarWidth, (chartWidth - (data.length - 1) * barSpacing) / data.length);
            const actualBarSpacing = data.length > 1 ? (chartWidth - data.length * barWidth) / (data.length - 1) : 0;
            // Find which bar is being hovered
            let newHoveredIndex = -1;
            for (let i = 0; i < data.length; i++) {
                const { x: barX, width: barWidth } = getBarRect(i);
                if (x >= barX && x <= barX + barWidth) {
                    newHoveredIndex = i;
                    break;
                }
            }
            
            // Update hover state
            if (newHoveredIndex !== hoveredIndex) {
                hoveredIndex = newHoveredIndex;
                drawChart();
                
                if (hoveredIndex >= 0) {
                    // Use global mouse coordinates for fixed positioning
                    showTooltip(e.clientX, e.clientY, labels[hoveredIndex], data[hoveredIndex], tableData[hoveredIndex].url);
                    canvas.style.cursor = 'pointer';
                    canvas.title = 'Click to view details in table below';
                } else {
                    hideTooltip();
                    canvas.style.cursor = 'default';
                    canvas.title = '';
                }
            } else if (hoveredIndex >= 0) {
                // Update tooltip position even when hovering the same bar
                showTooltip(e.clientX, e.clientY, labels[hoveredIndex], data[hoveredIndex], tableData[hoveredIndex].url);
            }
        });
        
        canvas.addEventListener('mouseleave', () => {
            hoveredIndex = -1;
            drawChart();
            hideTooltip();
            canvas.style.cursor = 'default';
        });
        
        // Handle click events for scrolling to table row
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const chartWidth = canvas.width / (window.devicePixelRatio || 1) - config.padding;
            const chartX = 8; // Small left margin to match drawChart
            // Calculate bar dimensions (same as in drawChart and mousemove)
            const minBarWidth = 30;
            const barSpacing = 15;
            const barWidth = Math.max(minBarWidth, (chartWidth - (data.length - 1) * barSpacing) / data.length);
            const actualBarSpacing = data.length > 1 ? (chartWidth - data.length * barWidth) / (data.length - 1) : 0;
            // Find which bar was clicked
            let clickedIndex = -1;
            for (let i = 0; i < data.length; i++) {
                const { x: barX, width: barWidth } = getBarRect(i);
                if (x >= barX && x <= barX + barWidth) {
                    clickedIndex = i;
                    break;
                }
            }
            
            if (clickedIndex >= 0) {
                scrollToTableRow(clickedIndex);
            }
        });
        
        // Store original indices to handle sorting
        let originalIndices = [];
        
        // Populate the table
        function populateTable() {
            const tableBody = document.getElementById('tableBody');
            tableBody.innerHTML = '';
            
            // Update original indices mapping
            originalIndices = tableData.map((row, index) => {
                return { ...row, originalIndex: row.originalIndex !== undefined ? row.originalIndex : index };
            });
            
            // Extract all URLs and process them sequentially for shortening
            const allUrls = tableData.map(row => String(row.url));
            const displayUrls = processUrlsForDisplay(allUrls);
            
            tableData.forEach((row, index) => {
                // Get the original index for this row
                const originalIndex = row.originalIndex !== undefined ? row.originalIndex : index;
                
                // Main row
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.setAttribute('data-original-index', originalIndex);
                tr.setAttribute('data-testid', \`${ReportTestIdPrefix.TABLE_ROW}-\${originalIndex}\`);
                
                // Expand button cell
                const expandCell = document.createElement('td');
                const expandBtn = document.createElement('button');
                expandBtn.className = 'expand-btn';
                expandBtn.setAttribute('data-testid', \`${ReportTestIdPrefix.EXPAND_BTN}-\${originalIndex}\`);
                expandBtn.innerHTML = '▶';
                expandBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleRow(originalIndex, index);
                };
                expandCell.appendChild(expandBtn);
                tr.appendChild(expandCell);
                
                // URL cell with sequential shortening
                const urlCell = document.createElement('td');
                urlCell.className = 'url-cell';
                const originalUrl = String(row.url);
                const displayUrl = displayUrls[index];
                urlCell.textContent = displayUrl;
                urlCell.title = originalUrl; // Always show full URL on hover
                
                // Add visual indicator if URL was shortened
                if (displayUrl !== originalUrl) {
                    urlCell.style.position = 'relative';
                    urlCell.classList.add('shortened-url');
                }
                
                tr.appendChild(urlCell);
                
                // Method cell
                const methodCell = document.createElement('td');
                methodCell.textContent = row.method || 'GET';
                methodCell.style.fontWeight = '600';
                methodCell.style.color = getMethodColor(row.method || 'GET');
                tr.appendChild(methodCell);
                
                // Time cell
                const timeCell = document.createElement('td');
                timeCell.className = 'time-cell';
                timeCell.textContent = row.time;
                tr.appendChild(timeCell);
                
                // Duration cell
                const durationCell = document.createElement('td');
                let isRowSlow = false;
                if (isCustomHighDuration === true) {
                    isRowSlow = row.isSlow;
                } else {
                    isRowSlow = row.duration >= highDuration;
                }
                durationCell.className = \`${ReportTestIdPrefix.DURATION_CELL} \${isRowSlow ? "${ReportClassName.DURATION_SLOW}" : "${ReportClassName.DURATION_FAST}"}\`;
                durationCell.setAttribute('data-testid', \`${ReportTestIdPrefix.DURATION_CELL}-\${originalIndex}\`);
                durationCell.setAttribute('data-duration-type', isRowSlow ? 'slow' : 'fast');
                durationCell.textContent = \`\${row.duration.toFixed(0)}ms\`;
                tr.appendChild(durationCell);
                
                // Add click handler to entire row
                tr.onclick = () => toggleRow(originalIndex, index);
                
                tableBody.appendChild(tr);
                
                // Expandable content row
                const expandRow = document.createElement('tr');
                expandRow.className = 'expandable-content';
                expandRow.id = \`expand-\${originalIndex}\`;
                expandRow.setAttribute('data-testid', \`${ReportTestIdPrefix.EXPANDABLE_ROW}-\${originalIndex}\`);
                
                const expandTd = document.createElement('td');
                expandTd.colSpan = 5;
                
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'expandable-details';
                
                // Full URL section (only show if URL was shortened)
                if (displayUrl !== String(row.url)) {
                    const fullUrlSection = document.createElement('div');
                    fullUrlSection.className = 'details-section';
                    fullUrlSection.setAttribute('data-testid', \`${ReportTestIdPrefix.FULL_URL_SECTION}-\${originalIndex}\`);
                    fullUrlSection.innerHTML = \`
                        <div class="details-title">
                            🔗 Full URL
                        </div>
                        <div class="details-content" style="word-break: break-all; font-family: monospace;" data-testid="${ReportTestIdPrefix.FULL_URL_CONTENT}-\${originalIndex}">
                            \${String(row.url)}
                        </div>
                    \`;
                    detailsDiv.appendChild(fullUrlSection);
                }
                
                // Parameters section
                const paramsSection = document.createElement('div');
                paramsSection.className = 'details-section';
                paramsSection.setAttribute('data-testid', \`${ReportTestIdPrefix.PARAMS_SECTION}-\${originalIndex}\`);
                paramsSection.innerHTML = \`
                    <div class="details-title">
                        🔍 URL Parameters
                    </div>
                    <div class="details-content params" id="params-\${originalIndex}" data-testid="${ReportTestIdPrefix.PARAMS_CONTENT}-\${originalIndex}">
                        \${formatParameters(row.query || {})}
                    </div>
                \`;
                detailsDiv.appendChild(paramsSection);
                
                // Headers section
                const headersSection = document.createElement('div');
                headersSection.className = 'details-section';
                headersSection.setAttribute('data-testid', \`${ReportTestIdPrefix.HEADERS_SECTION}-\${originalIndex}\`);
                headersSection.innerHTML = \`
                    <div class="details-title">
                        📋 Request Headers
                    </div>
                    <div class="details-content params" id="headers-\${originalIndex}" data-testid="${ReportTestIdPrefix.HEADERS_CONTENT}-\${originalIndex}">
                        \${formatParameters(row.headers || {})}
                    </div>
                \`;
                detailsDiv.appendChild(headersSection);
                
                // Request body section
                const bodySection = document.createElement('div');
                bodySection.className = 'details-section';
                bodySection.setAttribute('data-testid', \`${ReportTestIdPrefix.REQUEST_BODY_SECTION}-\${originalIndex}\`);
                // No extra space for the request body to be well formatted
                bodySection.innerHTML = \`
                    <div class="details-title">📄 Request Body</div>
                    <div class="details-content json" id="request-body-\${originalIndex}" data-testid="${ReportTestIdPrefix.REQUEST_BODY_CONTENT}-\${originalIndex}">\${formatRequestBody(row.requestBody || '')}</div>
                \`;
                detailsDiv.appendChild(bodySection);
                
                // Response headers section
                const responseHeadersSection = document.createElement('div');
                responseHeadersSection.className = 'details-section';
                responseHeadersSection.setAttribute('data-testid', \`${ReportTestIdPrefix.RESPONSE_HEADERS_SECTION}-\${originalIndex}\`);
                responseHeadersSection.innerHTML = \`
                    <div class="details-title">
                        📨 Response Headers \${row.statusCode ? \`(Status: \${row.statusCode})\` : ''}
                    </div>
                    <div class="details-content params" id="response-headers-\${originalIndex}" data-testid="${ReportTestIdPrefix.RESPONSE_HEADERS_CONTENT}-\${originalIndex}">
                        \${formatParameters(row.responseHeaders || {})}
                    </div>
                \`;
                detailsDiv.appendChild(responseHeadersSection);
                
                // Response body section
                const responseBodySection = document.createElement('div');
                responseBodySection.className = 'details-section';
                responseBodySection.setAttribute('data-testid', \`${ReportTestIdPrefix.RESPONSE_BODY_SECTION}-\${originalIndex}\`);
                responseBodySection.innerHTML = \`
                    <div class="details-title">📥 Response Body</div>
                    <div class="details-content json" id="response-body-\${originalIndex}" data-testid="${ReportTestIdPrefix.RESPONSE_BODY_CONTENT}-\${originalIndex}">\${formatRequestBody(row.responseBody || '')}</div>
                \`;
                detailsDiv.appendChild(responseBodySection);
                
                expandTd.appendChild(detailsDiv);
                expandRow.appendChild(expandTd);
                tableBody.appendChild(expandRow);
            });
        }
        
        // Helper function to get method color
        function getMethodColor(method) {
            const colors = {
                'GET': '#22c55e',
                'POST': '#3b82f6', 
                'PUT': '#f59e0b',
                'DELETE': '#ef4444',
                'PATCH': '#8b5cf6',
                'HEAD': '#6b7280',
                'OPTIONS': '#6b7280'
            };
            return colors[method.toUpperCase()] || '#6b7280';
        }
        
        // Helper function to format parameters
        function formatParameters(params) {
            const keys = Object.keys(params);
            if (keys.length === 0) {
                return '<div class="empty-state">No parameters</div>';
            }
            
            return keys.map(key => \`
                <div class="param-item">
                    <div class="param-key">\${key}:</div>
                    <div class="param-value">\${params[key]}</div>
                </div>
            \`).join('');
        }
        
        // Helper function to format request body
        function formatRequestBody(body) {
            if (!body || body.trim() === '') {
                return '<div class="empty-state">No request body</div>';
            }

            const isTruncated = body.trim().endsWith('...');
            let bodyToFormat = body;
            if (isTruncated) {
                bodyToFormat = body.trim().slice(0, -3); // Remove '...'
            }

            // Try to parse as JSON
            try {
                const parsed = JSON.parse(bodyToFormat);
                const pretty = JSON.stringify(parsed, null, 2);
                return isTruncated ? pretty + '...' : pretty;
            } catch (err) {
                // If not valid JSON, try to pretty-print as much as possible
                if (isTruncated) {
                    // Custom pretty-print for truncated JSON-like string
                    let result = '';
                    let indent = 0;
                    let inString = false;
                    let lastChar = '';
                    const tab = '  ';
                    for (let i = 0; i < bodyToFormat.length; i++) {
                        const char = bodyToFormat[i];
                        if (char === '"' && lastChar !== '\\\\') {
                            inString = !inString;
                        }
                        if (!inString) {
                            if (char === '{' || char === '[') {
                                result += char + '\\n' + tab.repeat(++indent);
                            } else if (char === '}' || char === ']') {
                                result += '\\n' + tab.repeat(--indent) + char;
                            } else if (char === ',') {
                                result += char + '\\n' + tab.repeat(indent);
                            } else if (char === ':') {
                                result += ': ';
                            } else if (char === '\\n' || char === '\\r') {
                                // skip
                            } else {
                                result += char;
                            }
                        } else {
                            result += char;
                        }
                        lastChar = char;
                    }
                    return result.trimEnd() + '...';
                }
                // Log error for debugging
                if (typeof console !== 'undefined') {
                    console.error('formatRequestBody error:', err, body);
                }
                return body;
            }
        }
        
        // Toggle row expansion
        function toggleRow(originalIndex, currentIndex) {
            const expandRow = document.getElementById(\`expand-\${originalIndex}\`);
            const expandBtn = document.querySelector(\`tr:nth-child(\${(currentIndex * 2) + 1}) .expand-btn\`);
            
            if (expandRow && expandRow.classList.contains('show')) {
                expandRow.classList.remove('show');
                if (expandBtn) {
                    expandBtn.classList.remove('expanded');
                    expandBtn.innerHTML = '▶';
                }
            } else if (expandRow) {
                expandRow.classList.add('show');
                if (expandBtn) {
                    expandBtn.classList.add('expanded');
                    expandBtn.innerHTML = '▼';
                }
            }
        }
        
        // Scroll to and expand table row
        function scrollToTableRow(originalIndex) {
            // First scroll to the table container
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) {
                tableContainer.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
                
                // Wait for scroll to complete, then find and expand the row
                setTimeout(() => {
                    // Find the row with the matching original index
                    const targetRow = document.querySelector(\`tr[data-original-index="\${originalIndex}"]\`);
                    
                    if (targetRow) {
                        // Scroll to the specific row
                        targetRow.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'center' 
                        });
                        
                        // Find the expand row and button
                        const expandRow = document.getElementById(\`expand-\${originalIndex}\`);
                        const expandBtn = targetRow.querySelector('.expand-btn');
                        
                        setTimeout(() => {
                            // Expand the row if it's not already expanded
                            if (expandRow && expandBtn && !expandRow.classList.contains('show')) {
                                expandRow.classList.add('show');
                                expandBtn.classList.add('expanded');
                                expandBtn.innerHTML = '▼';
                            }
                            
                            // Add a subtle highlight effect
                            targetRow.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
                            setTimeout(() => {
                                targetRow.style.backgroundColor = '';
                            }, 2000);
                        }, 300);
                    } else {
                        console.warn('Could not find table row for original index:', originalIndex);
                    }
                }, 500);
            }
        }
        
        // Initialize original indices
        tableData.forEach((row, index) => {
            if (row.originalIndex === undefined) {
                row.originalIndex = index;
            }
        });
        
        // Initial setup
        populateTable();
        resizeCanvas();
        
        // Initialize sorting functionality
        initializeSorting();
        
        // Show/hide scroll indicator based on content width
        function updateScrollIndicator() {
            const scrollIndicator = document.getElementById('scrollIndicator');
            const scrollArea = document.querySelector('.chart-scroll-area');
            const content = document.querySelector('.chart-content');
            
            if (scrollIndicator && scrollArea && content) {
                const isScrollable = content.scrollWidth > scrollArea.clientWidth;
                scrollIndicator.style.display = isScrollable ? 'block' : 'none';
            }
        }
        
        // Handle window resize
        window.addEventListener('resize', () => {
            resizeCanvas();
            updateScrollIndicator();
        });
        
        // Update scroll indicator after initial setup
        setTimeout(updateScrollIndicator, 100);
        
        // Animation on load
        let animationProgress = 0;
        const originalData = [...data];
        
        function animate() {
            animationProgress += 0.02;
            if (animationProgress <= 1) {
                data.forEach((value, index) => {
                    data[index] = originalData[index] * Math.min(animationProgress, 1);
                });
                drawChart();
                requestAnimationFrame(animate);
            } else {
                data.forEach((value, index) => {
                    data[index] = originalData[index];
                });
                drawChart();
            }
        }
        
        animate();

        // Helper function to find common prefix between two URLs
        function findCommonPrefix(url1, url2) {
            const str1 = String(url1);
            const str2 = String(url2);
            let commonPrefix = '';
            
            const minLength = Math.min(str1.length, str2.length);
            for (let i = 0; i < minLength; i++) {
                if (str1[i] === str2[i]) {
                    commonPrefix += str1[i];
                } else {
                    break;
                }
            }
            
            // Only consider meaningful prefixes and end at logical boundaries
            if (commonPrefix.length < 15) return '';
            
            // Try to end at a logical boundary
            const lastSlash = commonPrefix.lastIndexOf('/');
            const lastQuestion = commonPrefix.lastIndexOf('?');
            const lastAmpersand = commonPrefix.lastIndexOf('&');
            
            const boundaries = [lastSlash, lastQuestion, lastAmpersand].filter(pos => pos > 10);
            if (boundaries.length > 0) {
                const lastBoundary = Math.max(...boundaries);
                if (lastBoundary > commonPrefix.length * 0.6) {
                    commonPrefix = commonPrefix.substring(0, lastBoundary + 1);
                }
            }
            
            return commonPrefix;
        }
        
        // Helper function to process URLs sequentially for shortening
        function processUrlsForDisplay(urls) {
            const urlStrings = urls.map(url => String(url));
            const processedUrls = [];
            const seenPatterns = new Map(); // pattern -> first occurrence index
            
            for (let i = 0; i < urlStrings.length; i++) {
                const currentUrl = urlStrings[i];
                let shouldShorten = false;
                let patternToUse = '';
                
                // Check if this URL shares a pattern with any previous URL
                for (const [pattern, firstIndex] of seenPatterns.entries()) {
                    if (currentUrl.startsWith(pattern)) {
                        shouldShorten = true;
                        patternToUse = pattern;
                        break;
                    }
                }
                
                if (shouldShorten) {
                    // Shorten using the existing pattern
                    const shortened = '...' + currentUrl.substring(patternToUse.length);
                    processedUrls.push(shortened);
                } else {
                    // This is a new pattern, check if we can establish a pattern with future URLs
                    let newPattern = '';
                    
                    // Look ahead to find if this URL shares a pattern with upcoming URLs
                    for (let j = i + 1; j < urlStrings.length; j++) {
                        const commonPrefix = findCommonPrefix(currentUrl, urlStrings[j]);
                        if (commonPrefix && commonPrefix.length >= 15) {
                            newPattern = commonPrefix;
                            break;
                        }
                    }
                    
                    if (newPattern) {
                        // Store this pattern for future use
                        seenPatterns.set(newPattern, i);
                    }
                    
                    // Show the full URL for the first occurrence
                    processedUrls.push(currentUrl);
                }
            }
            
            return processedUrls;
        }

        // Sorting state
        let currentSort = {
            column: null,
            direction: 'asc' // 'asc' or 'desc'
        };
        
        // Helper function to parse time for sorting
        function parseTimeForSort(timeString) {
            // Convert "HH:MM:SSs MMMms" format to milliseconds for comparison
            const match = timeString.match(/(\\d{2}):(\\d{2}):(\\d{2})s (\\d+)ms/);
            if (!match) return 0;
            
            const [, hours, minutes, seconds, milliseconds] = match;
            return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)) * 1000 + parseInt(milliseconds);
        }
        
        // Helper function to get sort value from row data
        function getSortValue(row, column) {
            switch (column) {
                case 'url':
                    return String(row.url).toLowerCase();
                case 'method':
                    return (row.method || 'GET').toLowerCase();
                case 'time':
                    return parseTimeForSort(row.time);
                case 'duration':
                    return row.duration || 0;
                default:
                    return '';
            }
        }
        
        // Sort function
        function sortTableData(column) {
            // Determine sort direction
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            // Ensure original indices are preserved before sorting
            tableData.forEach((row, index) => {
                if (row.originalIndex === undefined) {
                    row.originalIndex = index;
                }
            });
            
            // Sort the data
            tableData.sort((a, b) => {
                const aValue = getSortValue(a, column);
                const bValue = getSortValue(b, column);
                
                let comparison = 0;
                if (aValue < bValue) {
                    comparison = -1;
                } else if (aValue > bValue) {
                    comparison = 1;
                }
                
                return currentSort.direction === 'asc' ? comparison : -comparison;
            });
            
            // Update header classes
            updateSortHeaders();
            
            // Re-populate the table
            populateTable();
        }
        
        // Update header sort indicators
        function updateSortHeaders() {
            // Reset all headers
            const headers = document.querySelectorAll('.data-table th.sortable');
            headers.forEach(header => {
                header.classList.remove('sorted-asc', 'sorted-desc');
            });
            
            // Set current sort header
            if (currentSort.column) {
                const currentHeader = document.querySelector(\`[data-sort="\${currentSort.column}"]\`);
                if (currentHeader) {
                    currentHeader.classList.add(currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
                }
            }
        }
        
        // Initialize sorting event listeners
        function initializeSorting() {
            const sortableHeaders = document.querySelectorAll('.data-table th.sortable');
            sortableHeaders.forEach(header => {
                header.addEventListener('click', () => {
                    const column = header.getAttribute('data-sort');
                    if (column) {
                        sortTableData(column);
                    }
                });
            });
        }

        // Accessibility: Add tabindex, aria-label, and keyboard support to expand buttons
        function addAccessibilityToExpandButtons() {
            const expandBtns = document.querySelectorAll('.expand-btn');
            expandBtns.forEach((btn, idx) => {
                btn.setAttribute('tabindex', '0');
                btn.setAttribute('aria-label', 'Expand row details');
                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        btn.click();
                    }
                });
            });
        }
        // Call after table is populated
        setTimeout(addAccessibilityToExpandButtons, 100);

        // Table scrollable visual cue
        function updateTableScrollableCue() {
            const tableContainer = document.querySelector('.table-container');
            if (!tableContainer) return;
            if (tableContainer.scrollWidth > tableContainer.clientWidth) {
                tableContainer.classList.add('scrollable');
            } else {
                tableContainer.classList.remove('scrollable');
            }
        }
        window.addEventListener('resize', updateTableScrollableCue);
        setTimeout(updateTableScrollableCue, 200);
    </script>
</body>
</html>
`;
