import { useEffect } from "react";
import { useConst } from "powerhooks/useConst";
import { useConstCallback } from "powerhooks/useConstCallback";
import { Deferred } from "evt/tools/Deferred";
import { useEffectOnValueChange } from "powerhooks/useEffectOnValueChange";

type Destructor = () => void;

type EffectCallback = () => void | Destructor;

export function createUseDebounce(params: { delay: number }) {
    const { delay } = params;

    function useDebounce(
        effectCallback: EffectCallback,
        deps: readonly [value: any, ...moreValues: any[]],
    ) {
        const { waitForDebounce } = useConst(() => waitForDebounceFactory({ delay }));

        const isUnmountedRef = useConst(() => ({ "current": false }));

        const constEffectCallback = useConstCallback(effectCallback);

        useEffect(
            () => () => {
                isUnmountedRef.current = true;
            },
            [],
        );

        useEffectOnValueChange(() => {
            console.log("====================> ", deps);

            let isActive = true;
            let destructor: Destructor | undefined = undefined;

            (async () => {
                await waitForDebounce();

                if (isUnmountedRef.current) {
                    console.log("heeeeeeere");
                    return;
                }

                destructor = constEffectCallback() ?? undefined;

                if (!isActive) {
                    destructor?.();
                }
            })();

            return () => {
                console.log("!!!!!!!!!!!!!!!!!!!!!!!! cleanup", deps);
                isActive = false;
                destructor?.();
            };
        }, deps);
    }

    return { useDebounce };
}

export function waitForDebounceFactory(params: { delay: number }) {
    const { delay } = params;

    let curr: { timer: ReturnType<typeof setTimeout>; startTime: number } | undefined =
        undefined;

    function waitForDebounce(): Promise<void | never> {
        const dOut = new Deferred<void | never>();

        const timerCallback = () => {
            curr = undefined;
            dOut.resolve();
        };

        if (curr !== undefined) {
            clearTimeout(curr.timer);

            curr.timer = setTimeout(timerCallback, delay - (Date.now() - curr.startTime));

            return dOut.pr;
        } else {
            const startTime = Date.now();

            curr = {
                "timer": setTimeout(timerCallback, delay),
                startTime,
            };
        }

        return dOut.pr;
    }

    return { waitForDebounce };
}