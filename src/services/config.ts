import { API_BASE, API_BASE_DEV } from "../utils/constants";

export function getApiBase(): string {
    if (process.env.NODE_ENV === "development") {
        return API_BASE_DEV;
    }
    return API_BASE;
}
