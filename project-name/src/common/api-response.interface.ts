export const SUCCESS_CODE = 200;
export const SUCCESS_MSG = 'success';

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}
