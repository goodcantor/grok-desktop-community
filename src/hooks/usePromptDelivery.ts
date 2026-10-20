import { useExecutionDelivery } from "./useExecutionDelivery";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ComposerSubmit, QueuedPrompt } from "../types/prompt";
import type {TurnOutcome} from '../components/ChatActivity';
import {
  previewCaptureRefuseError,
  previewCaptureToSubmit,
  type PendingImage,
} from "../lib/pending-images";
import { isAuthError, type ConnState } from "../lib/conn";
import {
  appendUserMessage,
  claimQueuedUserMessage,
  finalizeOpenTools,
  removeQueuedUserMessage,
  restoreQueuedUserMessage,
  removeUserInterjection,
  uid,
} from "../lib/timeline";
import {
  interjectRpcFollowUp,
  midTurnAction,
} from "../../shared/prompt-delivery.mjs";
import type { TimelineImage, TimelineItem } from "../types/desktop";

type DeliverPayload = {
  text: string;
  images: PendingImage[];
  imageQuality?: "compact" | "high";
  timelineText?: string;
  queueId?: string;
};

function userBubbleText(payload: {
  text: string;
  timelineText?: string;
}): string {
  return String(payload.timelineText || payload.text || "").trim();
}

/**
 * Mid-turn queue + session/prompt delivery (CLI-style Enter / Ctrl+Enter).
 * Preview screenshots use mode "interject" while a turn is running.
 */
export function useLegacyPromptDelivery(opts: {
  project: string | null;
  sessionId:string|null;
  conn: ConnState;
  busyRef: MutableRefObject<boolean>;
  openingRef: MutableRefObject<boolean>;
  pinToBottom: () => void;
  setConn: Dispatch<SetStateAction<ConnState>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setItems: Dispatch<SetStateAction<TimelineItem[]>>;
  refreshAuth: () => void;
}) {
  const {
    project,
    conn,
    busyRef,
    openingRef,
    pinToBottom,
    setConn,
    setError,
    setItems,
    refreshAuth,
  } = opts;

  const queueKey=project&&opts.sessionId?project+"\0"+opts.sessionId:null;
  const queueReady=useRef(false),queueScope=useRef(queueKey);
  if(queueScope.current!==queueKey){queueScope.current=queueKey;queueReady.current=false;}
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  const [queuePaused,setQueuePaused]=useState(false),queuePausedRef=useRef(false);
  const [turnOutcome,setTurnOutcome]=useState<TurnOutcome|null>(null);
  useEffect(()=>{if(!promptQueue.length)return;const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[promptQueue.length]);
  const promptQueueRef = useRef<QueuedPrompt[]>([]);
  const sendNowRef = useRef<QueuedPrompt | null>(null);
  const deliveryGenRef = useRef(0);
  const deliverRef = useRef<(payload: DeliverPayload) => Promise<void>>(
    async () => {},
  );

  useEffect(() => {
    promptQueueRef.current = promptQueue;
  }, [promptQueue]);

  useEffect(()=>{let active=true;queueReady.current=false;if(!queueKey){setPromptQueue([]);promptQueueRef.current=[];return;}
    void window.grokDesktop.queueRead(queueKey).then(items=>{if(!active||queueScope.current!==queueKey)return;const restored=items.map(q=>({...q,images:(q.images||[]).map(img=>({...img,previewUrl:`data:${img.mimeType};base64,${img.data}`}))}));queuePausedRef.current=true;setQueuePaused(true);promptQueueRef.current=restored;setPromptQueue(restored);queueReady.current=true;}).catch(e=>setError('Could not restore queue: '+String(e)));return()=>{active=false;};
  },[queueKey]);
  useEffect(()=>{if(!queueKey||!queueReady.current)return;const items=promptQueue.map(q=>({...q,images:q.images.map(({source,previewUrl,...img})=>({...img,previewUrl:''}))}));void window.grokDesktop.queueSave(queueKey,items).catch(e=>setError('Could not save queue: '+String(e)));},[promptQueue,queueKey]);
  const clearPromptQueue = useCallback(() => {
    queueReady.current=false;
    queuePausedRef.current=true;setQueuePaused(true);setTurnOutcome(null);
    deliveryGenRef.current += 1;
    setPromptQueue([]);
    promptQueueRef.current = [];
    sendNowRef.current = null;
  }, []);

  const enqueuePrompt = useCallback(
    (
      text: string,
      images: PendingImage[],
      imageQuality: "compact" | "high" = "compact",
      timelineText?: string,
    ) => {
      const item: QueuedPrompt = {
        id: uid("q"),
        text,
        images: images.map((img) => ({ ...img })),
        imageQuality,
        timelineText,
        at: Date.now(),
      };
      setPromptQueue((prev) => {
        const next = [...prev, item];
        promptQueueRef.current = next;
        return next;
      });
      const shown = String(timelineText || text || "").trim();
      setItems((prev) =>
        appendUserMessage(prev, {
          text: shown || text,
          images: item.images.map((img) => ({
            mimeType: img.mimeType,
            previewUrl: img.previewUrl,
          })),
          queued: true,
          queueId: item.id,
        }),
      );
      return item;
    },
    [setItems],
  );

  const removeQueued = useCallback((id: string) => {
    setPromptQueue((prev) => {
      const next = prev.filter((q) => q.id !== id);
      promptQueueRef.current = next;
      return next;
    });
    if (sendNowRef.current?.id === id) sendNowRef.current = null;
    setItems((prev) => removeQueuedUserMessage(prev, id));
  }, [setItems]);

  const editQueued=useCallback((id:string,text:string)=>{
    const item=promptQueueRef.current.find(q=>q.id===id);if(!item||!text.trim())return;
    const next=promptQueueRef.current.map(q=>q.id===id?{...q,text:text.trim(),timelineText:undefined}:q);promptQueueRef.current=next;setPromptQueue(next);
    setItems(prev=>prev.map(item=>item.kind==='user'&&item.queueId===id?{...item,text:text.trim()}:item));
  },[setItems]);
  const moveQueued=useCallback((id:string,direction:number)=>{const next=[...promptQueueRef.current],at=next.findIndex(q=>q.id===id),to=at+direction;if(at<0||to<0||to>=next.length)return;[next[at],next[to]]=[next[to],next[at]];promptQueueRef.current=next;setPromptQueue(next);},[]);
  const [failedDelivery,setFailedDelivery]=useState<DeliverPayload|null>(null);
  const deliverPrompt = useCallback(
    async (payload: DeliverPayload) => {
      if (!project || busyRef.current || openingRef.current) return;
      const text = payload.text.trim();
      const images = payload.images;
      if (!text && images.length === 0) return;

      const gen = deliveryGenRef.current;
      const startedAt=Date.now();setTurnOutcome(null);
      pinToBottom();
      busyRef.current = true;
      setConn("busy");
      const timelineImages: TimelineImage[] = images.map((img) => ({
        mimeType: img.mimeType,
        previewUrl: img.previewUrl,
      }));
      const queueId = String(payload.queueId || "").trim();
      setItems((prev) => {
        if (queueId) {
          const claimed = claimQueuedUserMessage(prev, queueId);
          if (claimed !== prev) return claimed;
        }
        return appendUserMessage(prev, {
          text: userBubbleText(payload) || text,
          images: timelineImages,
          optimistic: true,
        });
      });
      const stale = () =>
        openingRef.current || deliveryGenRef.current !== gen;
      let mayContinue=false;
      try {
        const reply=await window.grokDesktop.prompt(text, {
          images: images.map(({ data, mimeType }) => ({ data, mimeType })),
          imageQuality: payload.imageQuality || "compact",
        });
        if (stale()) return;
        setTurnOutcome({startedAt,endedAt:Date.now(),status:reply?.stopReason==='cancelled'?'stopped':'completed'});
        setItems((prev) => finalizeOpenTools(prev, "completed"));
        setConn("online");
        mayContinue=true;
      } catch (e: unknown) {
        if (stale()) return;
        const msg = e instanceof Error ? e.message : String(e);
        const cancelled = /cancel/i.test(msg);
        setTurnOutcome({startedAt,endedAt:Date.now(),status:cancelled?'stopped':'failed'});
        if (cancelled) {
          mayContinue=true;
          setItems((prev) => finalizeOpenTools(prev, "cancelled"));
          setConn("online");
        } else {
          queuePausedRef.current=true;setQueuePaused(true);
          setConn("error");
          setFailedDelivery(payload);
          setError(msg);
          setItems((prev) => [
            ...finalizeOpenTools(prev, "failed"),
            {
              id: uid("sys"),
              kind: "system",
              text: `Error: ${msg}`,
              at: Date.now(),
            },
          ]);
          if (isAuthError(msg)) refreshAuth();
        }
      } finally {
        busyRef.current = false;
        if (stale()||!mayContinue) return;
        const nextNow = sendNowRef.current;
        if (nextNow) {
          sendNowRef.current = null;
          setPromptQueue((prev) => {
            const next = prev.filter((q) => q.id !== nextNow.id);
            promptQueueRef.current = next;
            return next;
          });
          void deliverRef.current({
            text: nextNow.text,
            images: nextNow.images,
            imageQuality: nextNow.imageQuality,
            timelineText: nextNow.timelineText,
            queueId: nextNow.id,
          });
          return;
        }
        const queued = !queuePausedRef.current&&promptQueueRef.current[0];
        if (queued) {
          setPromptQueue((prev) => {
            const next = prev.slice(1);
            promptQueueRef.current = next;
            return next;
          });
          void deliverRef.current({
            text: queued.text,
            images: queued.images,
            imageQuality: queued.imageQuality,
            timelineText: queued.timelineText,
            queueId: queued.id,
          });
        }
      }
    },
    [
      project,
      busyRef,
      openingRef,
      pinToBottom,
      setConn,
      setError,
      setItems,
      refreshAuth,
    ],
  );

  deliverRef.current = deliverPrompt;

  const deliverInterject = useCallback(
    async (payload: DeliverPayload): Promise<"ok" | "queue" | "error"> => {
      const text = payload.text.trim();
      const images = payload.images;
      const imageQuality = payload.imageQuality || "compact";
      if (!text && images.length === 0) return "error";

      const interjectionId = uid("ij");
      const gen = deliveryGenRef.current;
      const timelineImages: TimelineImage[] = images.map((img) => ({
        mimeType: img.mimeType,
        previewUrl: img.previewUrl,
      }));
      pinToBottom();
      const queueId = String(payload.queueId || "").trim();
      setItems((prev) => {
        if (queueId) {
          const claimed = claimQueuedUserMessage(prev, queueId, {
            interjectionId,
          });
          if (claimed !== prev) return claimed;
        }
        return appendUserMessage(prev, {
          text: userBubbleText(payload) || text,
          images: timelineImages,
          optimistic: true,
          interjectionId,
        });
      });
      const stale = () =>
        openingRef.current || deliveryGenRef.current !== gen;
      const revertBubble = () => {
        if (queueId) {
          setItems((prev) => restoreQueuedUserMessage(prev, queueId));
          return;
        }
        setItems((prev) => removeUserInterjection(prev, interjectionId));
      };
      try {
        const result = await window.grokDesktop.interject(text, {
          images: images.map(({ data, mimeType }) => ({ data, mimeType })),
          imageQuality,
          interjectionId,
        });
        if (stale()) {
          revertBubble();
          return "error";
        }
        const follow = interjectRpcFollowUp(result);
        if (follow === "ok") return "ok";
        revertBubble();
        if (follow === "queue") {
          setError("This engine queued your correction; it will run after the current response.");
          if (queueId) return "queue";
          if (!busyRef.current) {
            void deliverPrompt({
              text,
              images,
              imageQuality,
              timelineText: payload.timelineText,
            });
            return "ok";
          }
          enqueuePrompt(text, images, imageQuality, payload.timelineText);
          return "queue";
        }
        const fail =
          result && typeof result === "object"
            ? String(
                (result as { error?: string; reason?: string }).error ||
                  (result as { reason?: string }).reason ||
                  "Interject failed",
              )
            : "Interject failed";
        setError(fail);
        return "error";
      } catch (e: unknown) {
        revertBubble();
        if (stale()) return "error";
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return "error";
      }
    },
    [
      busyRef,
      openingRef,
      enqueuePrompt,
      deliverPrompt,
      pinToBottom,
      setError,
      setItems,
    ],
  );

  /**
   * Accept composer submit. Returns true when the draft should clear
   * (queued, interject, or delivered). False when refused (opening / no project).
   */
  const submitFromComposer = useCallback(
    async ({
      text,
      images,
      mode,
      imageQuality = "compact",
      timelineText,
    }: ComposerSubmit): Promise<boolean> => {
      if (!project || openingRef.current || conn === "connecting") {
        return false;
      }
      if (!text && images.length === 0) return false;

      const action = midTurnAction(
        mode,
        busyRef.current || conn === "busy",
      );
      if (action === "send-now") {
        const item = enqueuePrompt(
          text,
          images,
          imageQuality,
          timelineText,
        );
        sendNowRef.current = item;
        setItems((prev) => finalizeOpenTools(prev, "cancelled"));
        void window.grokDesktop.cancel();
        return true;
      }
      if (action === "queue") {
        enqueuePrompt(text, images, imageQuality, timelineText);
        return true;
      }
      if (action === "interject") {
        void deliverInterject({ text, images, imageQuality, timelineText });
        return true;
      }

      // Do not await the full turn — Composer clears the draft on this true.
      // deliverPrompt owns busy/queue drain for the rest of the turn.
      void deliverPrompt({ text, images, imageQuality, timelineText });
      return true;
    },
    [
      project,
      openingRef,
      conn,
      busyRef,
      enqueuePrompt,
      setItems,
      deliverInterject,
      deliverPrompt,
    ],
  );

  const submitPreviewCapture = useCallback(
    (payload: {
      data?: unknown;
      mimeType?: unknown;
      text?: unknown;
    }) => {
      const parsed = previewCaptureToSubmit(payload);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const busy = busyRef.current || conn === "busy";
      void submitFromComposer({
        ...parsed.submit,
        mode: busy ? "interject" : "auto",
      }).then((ok) => {
        if (!ok) setError(previewCaptureRefuseError(project));
      });
    },
    [project, submitFromComposer, setError, busyRef, conn],
  );

  useEffect(() => {
    return window.grokDesktop.on("preview:viewport-capture", (payload) => {
      submitPreviewCapture(payload);
    });
  }, [submitPreviewCapture]);

  const sendQueuedNow = useCallback(
    (id?: string) => {
      if (openingRef.current) return;
      const list = promptQueueRef.current;
      const item = id ? list.find((q) => q.id === id) : list[0];
      if (!item) return;
      const payload: DeliverPayload = {
        text: item.text,
        images: item.images,
        imageQuality: item.imageQuality,
        timelineText: item.timelineText,
        queueId: item.id,
      };
      const take = () => {
        const next = promptQueueRef.current.filter((q) => q.id !== item.id);
        promptQueueRef.current = next;
        setPromptQueue(next);
      };
      const restore = () => {
        if (promptQueueRef.current.some((q) => q.id === item.id)) return;
        const next = [item, ...promptQueueRef.current];
        promptQueueRef.current = next;
        setPromptQueue(next);
      };
      if (busyRef.current) {
        take();
        void deliverInterject(payload).then((follow) => {
          if (follow !== "ok") restore();
        });
        return;
      }
      take();
      void deliverPrompt(payload);
    },
    [busyRef, openingRef, deliverInterject, deliverPrompt],
  );

  const changeQueuePaused=useCallback((paused:boolean)=>{
    if(!paused&&conn!=='online'&&conn!=='busy')return;
    queuePausedRef.current=paused;setQueuePaused(paused);
    if(paused||busyRef.current||openingRef.current||conn!=='online')return;
    const item=promptQueueRef.current[0];if(!item)return;
    const next=promptQueueRef.current.slice(1);promptQueueRef.current=next;setPromptQueue(next);
    void deliverRef.current({text:item.text,images:item.images,imageQuality:item.imageQuality,timelineText:item.timelineText,queueId:item.id});
  },[busyRef,openingRef,conn]);

  return {
    promptQueue,
    queuePaused,changeQueuePaused,turnOutcome,
    promptQueueRef,
    sendNowRef,
    clearPromptQueue,
    removeQueued,
    editQueued,moveQueued,failedDelivery,clearFailedDelivery:()=>setFailedDelivery(null),
    submitFromComposer,
    sendQueuedNow,
  };
}

export function usePromptDelivery(opts: Parameters<typeof useLegacyPromptDelivery>[0]) {
  const useDelivery=window.grokDesktop.executionQueue ? useExecutionDelivery : useLegacyPromptDelivery;
  return useDelivery(opts);
}
