import { VSCodeAPI } from '../types';

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode: VSCodeAPI = acquireVsCodeApi();

export function useVSCode(): VSCodeAPI {
  return vscode;
}
