<?php

class Modules_NebulynkPlesk_LongTasks extends pm_Hook_LongTasks
{
    public function getLongTasks()
    {
        return [new Modules_NebulynkPlesk_Task_Deployment()];
    }
}
