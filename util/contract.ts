import { Contract } from "ethers"
import { Log } from "@ethersproject/abstract-provider"
import { LogDescription } from "@ethersproject/abi"

export class ContractUtil {
    public static parseEventLogsByName(
        contract: Contract,
        eventName: string,
        logs: Log[],
    ): LogDescription[] {
        const topic = contract.interface.getEventTopic(eventName)
        return logs
            .filter((log) => log.topics[0] === topic)
            .map((log) => contract.interface.parseLog(log))
    }
}
