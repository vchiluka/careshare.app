import { createMemoryRepository } from "../memory";
import { repositoryContract } from "./contract";

repositoryContract("memory", async () => createMemoryRepository());
